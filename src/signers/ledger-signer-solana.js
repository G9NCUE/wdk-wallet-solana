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

import { getAddressEncoder } from '@solana/addresses'
import { getBase58Encoder } from '@solana/codecs'

import { InvalidSignerError, ValueError } from '@tetherto/wdk-wallet'

import {
  ISignerSolana,
  SOLANA_DERIVATION_PATH_PREFIX,
  DEFAULT_ACCOUNT_PATH,
  assertFullHardenedPath
} from './signer-solana.js'

/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */

/**
 * @typedef {Object} LedgerSignerSolanaOptions
 * @property {any} dmk - A Ledger DeviceManagementKit, built by the application with the transport it uses (WebHID, WebBLE, node-hid…).
 * @property {string} [path] - The account's path relative to m/44'/501' (default: "0'/0'").
 * @property {(args: { dmk: any, sessionId: string }) => Promise<any>} [buildSignerSolana] - Builds the kit's SignerSolana on a session; defaults to `SignerSolanaBuilder` from `@ledgerhq/device-signer-kit-solana`.
 */

// the string values of @ledgerhq/device-management-kit's DeviceActionStatus and DeviceStatus, kept
// here so this module loads without the kit (it is an optional peer dependency)
const ACTION = { completed: 'completed', error: 'error', stopped: 'stopped' }
const DEVICE = { locked: 'LOCKED', busy: 'BUSY', notConnected: 'NOT CONNECTED' }

async function defaultBuildSignerSolana ({ dmk, sessionId }) {
  const { SignerSolanaBuilder } = await import('@ledgerhq/device-signer-kit-solana')

  return new SignerSolanaBuilder({ dmk, sessionId }).build()
}

/**
 * A signer on a Ledger device through the Solana app, following Ledger's Device Management Kit: the
 * application builds the DeviceManagementKit with its transport and hands it in; the signer opens a
 * session on first use (the transport may prompt, so call it from a user gesture in a browser) and
 * shares it with every account derived from it.
 *
 * Transactions are signed as their compiled message. The Solana app signs messages as off-chain
 * messages, so {@link sign} returns a signature over the off-chain message, which the account's
 * `verify` accepts.
 *
 * @implements {ISignerSolana}
 */
export default class LedgerSignerSolana extends ISignerSolana {
  /**
   * Creates a Ledger signer.
   *
   * @param {LedgerSignerSolanaOptions} options - The options.
   * @throws {ValueError} If no DeviceManagementKit is given, or if the path is not fully hardened.
   */
  constructor ({ dmk, path = DEFAULT_ACCOUNT_PATH, buildSignerSolana = defaultBuildSignerSolana } = {}) {
    super()

    if (!dmk) {
      throw new ValueError('A Ledger DeviceManagementKit is required.')
    }

    assertFullHardenedPath(path)

    /** @private */
    this._dmk = dmk

    /** @private */
    this._buildSignerSolana = buildSignerSolana

    /** @private */
    this._path = `${SOLANA_DERIVATION_PATH_PREFIX}/${path}`

    /** @private */
    this._isChild = false

    /**
     * Shared by reference between a root and its children: the session, the kit's signer on it, the
     * connection in progress, and whether the root was disposed.
     *
     * @private
     */
    this._session = { id: '', signer: undefined, connecting: null, disposed: false }

    /** @private */
    this._address = undefined

    /** @private */
    this._publicKey = null
  }

  /**
   * Whether the signer can derive child signers: true for a root signer, false for a child.
   *
   * @type {boolean}
   */
  get isDerivable () {
    return !this._isChild
  }

  /**
   * The full derivation path of the signer's account.
   *
   * @type {string}
   */
  get path () {
    return this._path
  }

  /**
   * The signer's key pair: never a private key, the public key once the address has been read.
   *
   * @type {KeyPair}
   */
  get keyPair () {
    return { privateKey: null, publicKey: this._publicKey }
  }

  /**
   * Derives a child signer, on the same device session.
   *
   * @param {string} relPath - The path relative to m/44'/501' (e.g. "0'/0'").
   * @returns {Promise<LedgerSignerSolana>} The child signer.
   * @throws {InvalidSignerError} If the signer is a derived child.
   */
  async derive (relPath) {
    if (this._isChild) {
      throw new InvalidSignerError('Cannot derive: this signer is a derived child.')
    }

    const child = new LedgerSignerSolana({ dmk: this._dmk, path: relPath, buildSignerSolana: this._buildSignerSolana })
    child._isChild = true
    child._session = this._session

    return child
  }

  /**
   * Returns the signer's address, read from the device on the first call.
   *
   * @returns {Promise<string>} The address.
   */
  async getAddress () {
    if (!this._address) {
      const signer = await this._ready()
      this._address = await this._run(signer.getAddress(this._devicePath, { checkOnDevice: false }))
      this._publicKey = Uint8Array.from(getAddressEncoder().encode(this._address))
    }

    return this._address
  }

  /**
   * Signs a message: the Solana app signs it as a V0 off-chain message (Legacy on older firmware).
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The signature over the off-chain message, hex-encoded.
   */
  async sign (message) {
    const signer = await this._ready()
    const { signature: envelope } = await this._run(signer.signMessage(this._devicePath, message, { version: 'v0' }))

    return Buffer.from(signatureOfEnvelope(envelope)).toString('hex')
  }

  /**
   * Signs a transaction's compiled message on the device.
   *
   * @param {Uint8Array} messageBytes - The compiled transaction message.
   * @returns {Promise<Uint8Array>} The 64-byte Ed25519 signature.
   */
  async signTransactionMessage (messageBytes) {
    const signer = await this._ready()

    return Uint8Array.from(await this._run(signer.signTransaction(this._devicePath, messageBytes)))
  }

  /**
   * Disposes the signer. The root closes the device session, which ends every child derived from it;
   * a child keeps the session open for the others.
   */
  dispose () {
    if (this._isChild || this._session.disposed) {
      return
    }

    const id = this._session.id
    this._session.disposed = true
    this._session.signer = undefined
    this._session.id = ''

    if (id) {
      this._dmk.disconnect({ sessionId: id }).catch(() => {})
    }
  }

  /**
   * The derivation path as the signer kit wants it, without the "m/" prefix.
   *
   * @private
   * @type {string}
   */
  get _devicePath () {
    return this._path.slice(2)
  }

  /**
   * Connects on first use and checks that the device is unlocked and reachable.
   *
   * @private
   * @returns {Promise<any>} The kit's SignerSolana.
   */
  async _ready () {
    if (this._session.disposed) {
      throw new InvalidSignerError('The signer has been disposed.')
    }

    if (!this._session.id) {
      await this._connectOnce()
    }

    let state

    try {
      state = await firstEvent(this._dmk.getDeviceSessionState({ sessionId: this._session.id }))
    } catch {
      await this._connectOnce()
      return this._session.signer
    }

    if (state.deviceStatus === DEVICE.locked) {
      throw new InvalidSignerError('The Ledger device is locked.')
    }

    if (state.deviceStatus === DEVICE.busy) {
      throw new InvalidSignerError('The Ledger device is busy.')
    }

    if (state.deviceStatus === DEVICE.notConnected) {
      await this._connectOnce()
    }

    return this._session.signer
  }

  /**
   * Opens the device session, once: accounts resolved together share the connection in progress, or
   * each would prompt for the device.
   *
   * @private
   * @returns {Promise<void>}
   */
  _connectOnce () {
    this._session.connecting ??= this._connect().finally(() => { this._session.connecting = null })

    return this._session.connecting
  }

  /** @private */
  async _connect () {
    const session = this._session

    if (session.id) {
      this._dmk.disconnect({ sessionId: session.id }).catch(() => {})
      session.id = ''
    }

    const device = await firstEvent(this._dmk.startDiscovering({}))
    const id = await this._dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: true } })

    if (session.disposed) {
      this._dmk.disconnect({ sessionId: id }).catch(() => {})
      throw new InvalidSignerError('The signer has been disposed.')
    }

    session.id = id
    session.signer = await this._buildSignerSolana({ dmk: this._dmk, sessionId: id })
  }

  /**
   * Waits for a device action to finish and returns its output.
   *
   * @private
   * @param {{ observable: any }} action - The device action.
   * @returns {Promise<any>} The action's output.
   */
  async _run ({ observable }) {
    const event = await firstEvent(observable, e => e.status === ACTION.completed || e.status === ACTION.error || e.status === ACTION.stopped)

    if (event.status === ACTION.completed) {
      return event.output
    }

    if (event.status === ACTION.error) {
      const { error } = event
      const tag = error?._tag ?? error?.name ?? 'LedgerError'
      throw new InvalidSignerError(`${tag}: ${error?.message ?? error?.originalError?.message ?? String(error)}`)
    }

    throw new InvalidSignerError('The Ledger action was stopped on the device.')
  }
}

/**
 * The first event of an observable that matches, as a promise (the kits' observables are rxjs ones;
 * only `subscribe` is used, so rxjs is not needed here).
 *
 * @private
 */
function firstEvent (observable, match = () => true) {
  return new Promise((resolve, reject) => {
    let done = false
    let subscription = null
    subscription = observable.subscribe({
      next: (event) => {
        if (done || !match(event)) return
        done = true
        resolve(event)
        subscription?.unsubscribe()
      },
      error: (error) => { if (!done) { done = true; reject(error) } },
      complete: () => { if (!done) { done = true; reject(new InvalidSignerError('The Ledger action ended without a result.')) } }
    })
    if (done) subscription.unsubscribe()
  })
}

/**
 * The signature out of the signer kit's message envelope: base58 of a signature count (1), the 64-byte
 * signature, then the signed bytes.
 *
 * @private
 */
function signatureOfEnvelope (envelope) {
  let bytes

  try {
    bytes = getBase58Encoder().encode(envelope)
  } catch {}

  if (bytes?.[0] !== 1 || bytes.length < 65) {
    throw new InvalidSignerError('The Ledger returned a message envelope this signer does not understand.')
  }

  return bytes.slice(1, 65)
}
