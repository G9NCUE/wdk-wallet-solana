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
import { getBase58Encoder } from '@solana/codecs'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import curve from './ed25519.js'

import { AssertionError, InvalidSignerError, ValueError } from '@tetherto/wdk-wallet'

import { ISignerSolana } from './signer-solana.js'

/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */

/**
 * A signer on a single Ed25519 key: an imported account, a key a service gave out. It has no
 * derivation path and cannot derive; register it by name with `addSigner`.
 *
 * @implements {ISignerSolana}
 */
export default class PrivateKeySignerSolana extends ISignerSolana {
  /**
   * Creates a signer from a private key.
   *
   * @param {string | Uint8Array} secret - The 32-byte private key, or a 64-byte keypair (private key then public key, as `solana-keygen` and wallet exports write it), as bytes or base58.
   * @throws {ValueError} If the secret is neither 32 nor 64 bytes, or if a keypair's public half does not match its private half.
   */
  constructor (secret) {
    super()

    const bytes = typeof secret === 'string' ? decodeBase58(secret) : secret

    let privateKey, publicKey

    try {
      if (!(bytes instanceof Uint8Array) || (bytes.length !== 32 && bytes.length !== 64)) {
        throw new ValueError('A Solana private key is 32 bytes, or a 64-byte keypair.')
      }

      // a copy: disposing the signer wipes its own key, never the caller's buffer
      privateKey = Uint8Array.from(bytes.subarray(0, 32))
      publicKey = curve.getPublicKey(privateKey)

      if (bytes.length === 64 && !bytes.subarray(32).every((byte, i) => byte === publicKey[i])) {
        sodium_memzero(privateKey)
        throw new ValueError("The keypair's public key does not match its private key.")
      }
    } finally {
      if (bytes !== secret) {
        sodium_memzero(bytes)
      }
    }

    /** @private */
    this._privateKey = privateKey

    /** @private */
    this._publicKey = publicKey

    /** @private */
    this._address = getAddressDecoder().decode(publicKey)
  }

  /**
   * Always false: a private-key signer is a single account.
   *
   * @type {boolean}
   */
  get isDerivable () {
    return false
  }

  /**
   * Always null: a raw key has no derivation path.
   *
   * @type {null}
   */
  get path () {
    return null
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
   * @type {KeyPair}
   */
  get keyPair () {
    return {
      privateKey: this._privateKey ?? null,
      publicKey: this._publicKey
    }
  }

  /**
   * A private-key signer cannot derive.
   *
   * @returns {Promise<never>}
   * @throws {InvalidSignerError} Always.
   */
  async derive () {
    throw new InvalidSignerError('PrivateKeySignerSolana does not support derivation.')
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
   * Disposes the signer, erasing its private key from memory.
   */
  dispose () {
    if (this._privateKey) {
      sodium_memzero(this._privateKey)
    }

    this._privateKey = undefined
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
function decodeBase58 (secret) {
  try {
    return getBase58Encoder().encode(secret)
  } catch {
    throw new ValueError('The private key is not valid base58.')
  }
}
