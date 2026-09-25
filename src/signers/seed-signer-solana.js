// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict'

import { getAddressDecoder } from '@solana/addresses'

import HDKey from 'micro-key-producer/slip10.js'

import * as bip39 from 'bip39'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import curve from './ed25519.js'

import { AssertionError, InvalidSignerError, ValueError } from '@tetherto/wdk-wallet'

import {
  ISignerSolana,
  SOLANA_DERIVATION_PATH_PREFIX,
  DEFAULT_ACCOUNT_PATH,
  assertFullHardenedPath
} from './signer-solana.js'

/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */

/**
 * @typedef {Object} SeedSignerSolanaOptions
 * @property {HDKey} [root] - An existing SLIP-0010 master key to derive from, instead of a seed.
 * @property {string} [path] - The account's path relative to m/44'/501' (default: "0'/0'").
 * @property {boolean} [isChild] - If true, the signer keeps its own account only, not the master key.
 */

/**
 * A signer on a BIP-39 seed: Ed25519 keys derived with SLIP-0010 at m/44'/501'/<path>. A root signer
 * keeps the master key and derives children; a child keeps its own account only.
 *
 * @implements {ISignerSolana}
 */
export default class SeedSignerSolana extends ISignerSolana {
  /**
   * Creates a seed signer.
   *
   * @param {string | Uint8Array | null} seed - A [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes); null when `opts.root` is given.
   * @param {SeedSignerSolanaOptions} [opts] - The options.
   * @throws {ValueError} If the seed phrase is invalid, if both or neither of a seed and a root are given, or if the path is not fully hardened.
   */
  constructor (seed, opts = {}) {
    super()

    if (opts.root && seed) {
      throw new ValueError('Provide either a seed or a root, not both.')
    }

    if (!opts.root && !seed) {
      throw new ValueError('Seed or root is required.')
    }

    const path = opts.path ?? DEFAULT_ACCOUNT_PATH

    assertFullHardenedPath(path)

    let root = opts.root

    if (!root) {
      if (typeof seed === 'string' && !bip39.validateMnemonic(seed)) {
        throw new ValueError('The seed phrase is invalid.')
      }

      const seedBytes = typeof seed === 'string' ? bip39.mnemonicToSeedSync(seed) : seed

      root = HDKey.fromMasterSeed(seedBytes)

      if (seedBytes !== seed) {
        sodium_memzero(seedBytes)
      }
    }

    const fullPath = `${SOLANA_DERIVATION_PATH_PREFIX}/${path}`

    const { privateKey } = root.derive(fullPath, true)

    const publicKey = curve.getPublicKey(privateKey)

    /** @private */
    this._path = fullPath

    /**
     * Raw Ed25519 private key bytes (32 bytes).
     *
     * @private
     * @type {Uint8Array | undefined}
     */
    this._privateKey = privateKey

    /**
     * Raw Ed25519 public key bytes (32 bytes).
     *
     * @private
     * @type {Uint8Array}
     */
    this._publicKey = publicKey

    /** @private */
    this._address = getAddressDecoder().decode(publicKey)

    /**
     * The SLIP-0010 master key, kept by a root signer only.
     *
     * @private
     * @type {HDKey | undefined}
     */
    this._root = opts.isChild ? undefined : root

    if (opts.isChild && !opts.root) {
      wipe(root)
    }
  }

  /**
   * Whether the signer can derive child signers: true for a root signer, false for a child.
   *
   * @type {boolean}
   */
  get isDerivable () {
    return Boolean(this._root)
  }

  /**
   * The full derivation path of the signer's account (e.g. "m/44'/501'/0'/0'").
   *
   * @type {string}
   */
  get path () {
    return this._path
  }

  /**
   * The signer's address.
   *
   * @type {string}
   */
  get address () {
    return this._address
  }

  /**
   * The signer's key pair. The private key is null once the signer has been disposed.
   *
   * The uint8 arrays are bound to the signer, so any external change will reflect to the internal
   * representation: treat the key pair as a read-only view of the keys.
   *
   * @type {KeyPair}
   */
  get keyPair () {
    return {
      privateKey: this._privateKey ?? null,
      publicKey: this._publicKey
    }
  }

  /**
   * Derives a child signer.
   *
   * @param {string} relPath - The path relative to m/44'/501' (e.g. "0'/0'").
   * @returns {Promise<SeedSignerSolana>} The child signer.
   * @throws {InvalidSignerError} If the signer has no master key (a child, or a disposed root).
   */
  async derive (relPath) {
    if (!this._root) {
      throw new InvalidSignerError('Cannot derive: this signer has no root (it is a derived child or has been disposed).')
    }

    return new SeedSignerSolana(null, { root: this._root, path: relPath, isChild: true })
  }

  /**
   * Returns the signer's address.
   *
   * @returns {Promise<string>} The address.
   */
  async getAddress () {
    return this._address
  }

  /**
   * Signs a message: an Ed25519 signature over its UTF-8 bytes.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The signature, hex-encoded.
   * @throws {AssertionError} If the signer has been disposed.
   */
  async sign (message) {
    const signature = curve.sign(Buffer.from(message, 'utf8'), this._live())

    return Buffer.from(signature).toString('hex')
  }

  /**
   * Signs a transaction's compiled message.
   *
   * @param {Uint8Array} messageBytes - The compiled transaction message.
   * @returns {Promise<Uint8Array>} The 64-byte Ed25519 signature.
   * @throws {AssertionError} If the signer has been disposed.
   */
  async signTransactionMessage (messageBytes) {
    return curve.sign(messageBytes, this._live())
  }

  /**
   * Disposes the signer, erasing its private key and, for a root, its master key from memory.
   */
  dispose () {
    if (this._privateKey) {
      sodium_memzero(this._privateKey)
    }

    if (this._root) {
      wipe(this._root)
    }

    this._privateKey = undefined
    this._root = undefined
  }

  /** @private */
  _live () {
    if (!this._privateKey) {
      throw new AssertionError('The signer has been disposed.')
    }

    return this._privateKey
  }
}

/** @private */
function wipe (hdKey) {
  sodium_memzero(hdKey.privateKey)
  sodium_memzero(hdKey.chainCode)
}
