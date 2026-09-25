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

import WalletManager, { InvalidSignerError, ProviderRequiredError } from '@tetherto/wdk-wallet'

import WalletAccountSolana from './wallet-account-solana.js'
import SeedSignerSolana from './signers/seed-signer-solana.js'

/** @typedef {ReturnType<typeof import('@solana/rpc').createSolanaRpc>} SolanaRpc */
/** @typedef {import('@solana/rpc-types').Commitment} Commitment */

/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */

/** @typedef {import('./wallet-account-solana.js').SolanaWalletConfig} SolanaWalletConfig */

/** @typedef {import('./signers/signer-solana.js').ISignerSolana} ISignerSolana */

const FEE_RATE_NORMAL_MULTIPLIER = 110n

const FEE_RATE_FAST_MULTIPLIER = 200n

const DEFAULT_BASE_FEE = 5_000n

export default class WalletManagerSolana extends WalletManager {
  /**
   * Creates a new wallet manager for the solana blockchain.
   *
   * Accepts a seed, as before, or a root signer. A seed is wrapped in a seed signer and not kept by
   * the manager (`seed` is undefined). The default signer must be derivable; a signer that cannot
   * derive (e.g. a single-key signer) is registered by name with {@link addSigner}.
   *
   * @param {string | Uint8Array | ISignerSolana} seedOrSigner - A [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) mnemonic seed phrase, a raw BIP-32 master seed (16-64 bytes), or a derivable root signer.
   * @param {SolanaWalletConfig} [config] - The configuration object.
   * @throws {ValueError} If the seed phrase is invalid.
   * @throws {InvalidSignerError} If the default signer doesn't support account derivation.
   */
  constructor (seedOrSigner, config = {}) {
    const fromSeed = typeof seedOrSigner === 'string' || seedOrSigner instanceof Uint8Array

    const signer = fromSeed ? new SeedSignerSolana(seedOrSigner) : seedOrSigner

    if (!signer?.isDerivable) {
      throw new InvalidSignerError('The default signer must be derivable. Non-derivable signers (e.g. private-key signers) can only be registered by name via addSigner.')
    }

    super(signer, config)

    /**
     * If true, disposes the default signer when the manager is disposed: only a seed signer the
     * manager built itself. A signer you pass in, as default or by name, stays yours to dispose.
     *
     * @private
     * @type {boolean}
     */
    this._shouldWipeDefaultSignerOnDisposal = fromSeed

    /**
     * The solana wallet configuration.
     *
     * @protected
     * @type {SolanaWalletConfig}
     */
    this._config = config

    const { commitment = 'confirmed' } = config

    /**
     * The commitment level for transactions.
     *
     * @protected
     * @type {Commitment}
     */
    this._commitment = commitment

    /**
     * A Solana RPC client for HTTP requests. Shared with every account this manager creates,
     * so two accounts never open two clients for the same endpoint.
     *
     * @protected
     * @type {SolanaRpc | undefined}
     */
    this._rpc = WalletAccountSolana._buildRpc(config)
  }

  /**
   * Returns the wallet account at a specific index (see [SLIP-0010](https://slips.readthedocs.io/en/latest/slip-0010/)).
   *
   * @example
   * // Returns the account with derivation path m/44'/501'/index'/0'
   * const account = await wallet.getAccount(1);
   * @overload
   * @param {number} [index] - The index of the account to get (default: 0).
   * @param {Object} [options] - Account options.
   * @param {string} [options.signerName] - The signer name, when not the default signer.
   * @returns {Promise<WalletAccountSolana>} The account.
   */

  /**
   * Returns the wallet account of a signer registered by name with {@link addSigner}: the signer's
   * own account for a signer that cannot derive, its first account for one that can.
   *
   * @overload
   * @param {string} signerName - The signer name.
   * @returns {Promise<WalletAccountSolana>} The account.
   * @throws {NoSuchElementError} If no signer exists with the given name.
   */

  async getAccount (indexOrSignerName = 0, options = {}) {
    if (typeof indexOrSignerName === 'string') {
      const key = `${indexOrSignerName}#self`

      if (!this._accounts[key]) {
        const signer = this.getSigner(indexOrSignerName)

        this._accounts[key] = signer.isDerivable
          ? await this._accountOf(await signer.derive(signer.path.split('/').slice(3).join('/')), true)
          : await this._accountOf(signer, false)
      }

      return this._accounts[key]
    }

    return await this.getAccountByPath(`${indexOrSignerName}'/0'`, options)
  }

  /**
   * Returns the wallet account at a specific SLIP-0010 derivation path.
   *
   * @example
   * // Returns the account with derivation path m/44'/501'/0'/0'/1'
   * const account = await wallet.getAccountByPath("0'/0'/1'");
   * @param {string} path - The derivation path (e.g. "0'/0'/0'").
   * @param {Object} [options] - Account options.
   * @param {string} [options.signerName] - The signer name, when not the default signer.
   * @returns {Promise<WalletAccountSolana>} The account.
   * @throws {InvalidSignerError} If the signer cannot derive accounts.
   */
  async getAccountByPath (path, options = {}) {
    const { signerName } = options
    const key = signerName === undefined ? path : `${signerName}:${path}`

    if (!this._accounts[key]) {
      const signer = this.getSigner(signerName)

      if (!signer.isDerivable) {
        throw new InvalidSignerError(signerName === undefined
          ? 'The default signer cannot derive accounts (it may have been disposed).'
          : `The signer "${signerName}" cannot derive accounts: use getAccount("${signerName}").`)
      }

      this._accounts[key] = await this._accountOf(await signer.derive(path), true)
    }

    return this._accounts[key]
  }

  /**
   * Disposes the wallet manager: every account it created (each disposes the signer it derived),
   * and the default signer if the manager built it from a seed. Signers you passed in, as default or
   * by name, are left to you.
   */
  dispose () {
    // not super.dispose(): the base skips accounts without a private key (tetherto/wdk-wallet#73) and,
    // before wdk-wallet#52, disposes every signer, including the ones it was given
    for (const account of Object.values(this._accounts)) {
      account.dispose()
    }

    if (this._shouldWipeDefaultSignerOnDisposal) {
      this._defaultSigner.dispose()
    }

    this._accounts = {}
  }

  /**
   * Builds the account of a signer, its address resolved (a remote signer is asked once, here).
   *
   * @private
   * @param {ISignerSolana} signer - The signer.
   * @param {boolean} shouldWipeSignerOnDisposal - Whether the account owns the signer (one the manager derived).
   * @returns {Promise<WalletAccountSolana>} The account.
   */
  async _accountOf (signer, shouldWipeSignerOnDisposal) {
    const account = new WalletAccountSolana(signer, { ...this._accountConfig(), shouldWipeSignerOnDisposal })

    await account.getAddress()

    return account
  }

  /**
   * Builds the account config, injecting the manager's shared rpc client so accounts reuse
   * it instead of opening their own.
   *
   * @private
   * @returns {SolanaWalletConfig} The account configuration.
   */
  _accountConfig () {
    return { ...this._config, provider: this._rpc }
  }

  /**
   * Returns the current fee rates.
   *
   * @returns {Promise<FeeRates>} The fee rates (in lamports).
   * @throws {ProviderRequiredError} If the wallet is not connected to a provider.
   */
  async getFeeRates () {
    if (!this._rpc) {
      throw new ProviderRequiredError('The wallet must be connected to a provider to get fee rates.')
    }

    const fees = await this._rpc.getRecentPrioritizationFees().send()

    const nonZeroFees = fees.filter((fee) => fee.prioritizationFee > 0).map((fee) => BigInt(fee.prioritizationFee))

    const fee =
      nonZeroFees.length > 0 ? nonZeroFees.reduce((max, fee) => (fee > max ? fee : max), 0n) : DEFAULT_BASE_FEE

    return {
      normal: (fee * FEE_RATE_NORMAL_MULTIPLIER) / 100n,
      fast: (fee * FEE_RATE_FAST_MULTIPLIER) / 100n
    }
  }
}
