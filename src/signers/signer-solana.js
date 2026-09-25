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

import { ISigner, NotImplementedError, ValueError } from '@tetherto/wdk-wallet'

/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */

export const SOLANA_DERIVATION_PATH_PREFIX = "m/44'/501'"

export const DEFAULT_ACCOUNT_PATH = "0'/0'"

/**
 * Asserts that every level of a derivation path is hardened, as SLIP-0010 requires for Ed25519.
 *
 * @param {string} path - The derivation path.
 * @throws {ValueError} If a level is not hardened.
 */
export function assertFullHardenedPath (path) {
  if (!path.split('/').every(level => level.endsWith("'"))) {
    throw new ValueError('In Solana, every child path in a derivation path must be hardened.')
  }
}

/**
 * The Solana signer interface: whatever holds an account's Ed25519 key, a seed in memory, a hardware
 * device or a remote key service, behind the same calls.
 *
 * Both signing calls take bytes and give back a bare Ed25519 signature. A transaction is signed as its
 * compiled message bytes, the way Solana signs, so a signer never needs to understand a transaction
 * and several signers can sign one (a fee payer that is not the account, an extra signer such as a
 * create key): each adds its signature to the transaction's signature map.
 *
 * @interface
 * @extends {ISigner}
 */
export class ISignerSolana extends ISigner {
  /**
   * Whether the signer can derive child signers.
   *
   * @type {boolean}
   */
  get isDerivable () {
    throw new NotImplementedError('isDerivable')
  }

  /**
   * The full SLIP-0010 derivation path of the signer's account (e.g. "m/44'/501'/0'/0'"), or null
   * for a signer not bound to a path (e.g. a private-key signer). A derivable signer has one.
   *
   * @type {string | null}
   */
  get path () {
    throw new NotImplementedError('path')
  }

  /**
   * The signer's address, once known. Local signers know it at construction; a remote signer knows
   * it after the first {@link getAddress}.
   *
   * @type {string | undefined}
   */
  get address () {
    throw new NotImplementedError('address')
  }

  /**
   * The signer's key pair. The private key is null for a signer that cannot expose it (a hardware
   * device, a key service) and once the signer has been disposed.
   *
   * @type {KeyPair}
   */
  get keyPair () {
    throw new NotImplementedError('keyPair')
  }

  /**
   * Derives a child signer at a path relative to m/44'/501' (e.g. "0'/0'"). Every level is hardened.
   *
   * @param {string} relPath - The relative derivation path.
   * @returns {Promise<ISignerSolana>} The child signer.
   */
  async derive (relPath) {
    throw new NotImplementedError('derive(relPath)')
  }

  /**
   * Signs a message: an Ed25519 signature over its UTF-8 bytes.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The signature, hex-encoded.
   */
  async sign (message) {
    throw new NotImplementedError('sign(message)')
  }

  /**
   * Signs a transaction's compiled message. The signer never builds nor sends the transaction: it
   * signs the message bytes, and the account adds the signature to the transaction's signature map.
   *
   * @param {Uint8Array} messageBytes - The compiled transaction message.
   * @returns {Promise<Uint8Array>} The 64-byte Ed25519 signature.
   */
  async signTransactionMessage (messageBytes) {
    throw new NotImplementedError('signTransactionMessage(messageBytes)')
  }

  /**
   * Disposes the signer, erasing its secret material from memory. Safe to call more than once: a
   * signer registered by name is disposed with its account and again with the manager.
   */
  dispose () {
    throw new NotImplementedError('dispose()')
  }
}
