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
   * Accepts a seed, as before, or a root signer. The default signer must be derivable; a signer that
   * cannot derive (e.g. a single-key signer) is registered by name with {@link addSigner}.
   *
   * @param {string | Uint8Array | ISignerSolana} seedOrSigner - A [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) mnemonic seed phrase, a raw BIP-32 master seed (16-64 bytes), or a derivable root signer.
   * @param {SolanaWalletConfig} [config] - The configuration object.
   * @throws {InvalidSignerError} If the default signer doesn't support account derivation.
   */
  constructor (seedOrSigner, config = {}) {
    const fromSeed = typeof seedOrSigner === 'string' || seedOrSigner instanceof Uint8Array

    if (!fromSeed && !seedOrSigner?.isDerivable) {
      throw new InvalidSignerError('The default signer must be derivable. Non-derivable signers (e.g. private-key signers) can only be registered by name via addSigner.')
    }

    super(seedOrSigner, config)

    if (fromSeed) {
      /**
       * The default signer: a seed signer on the wallet's seed, which keeps the master key.
       *
       * @protected
       * @type {ISignerSolana}
       */
      this._defaultSigner = new SeedSignerSolana(this.seed)
    }

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
        const accountSigner = signer.isDerivable
          ? await signer.derive(signer.path.split('/').slice(3).join('/'))
          : signer

        this._accounts[key] = await this._accountOf(accountSigner)
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
   */
  async getAccountByPath (path, options = {}) {
    const { signerName } = options
    const key = signerName === undefined ? path : `${signerName}:${path}`

    if (!this._accounts[key]) {
      const signer = this.getSigner(signerName)

      this._accounts[key] = await this._accountOf(await signer.derive(path))
    }

    return this._accounts[key]
  }

  /**
   * Disposes the wallet manager: every account it created, then its signers.
   */
  dispose () {
    // the base class disposes only the accounts that expose a private key; an account on a signer
    // that keeps its key elsewhere must be disposed too, or it keeps signing
    for (const account of Object.values(this._accounts)) {
      account.dispose()
    }

    super.dispose()
  }

  /**
   * Builds the account of a signer, its address resolved first (a remote signer learns it on the
   * first call).
   *
   * @private
   * @param {ISignerSolana} signer - The signer.
   * @returns {Promise<WalletAccountSolana>} The account.
   */
  async _accountOf (signer) {
    await signer.getAddress()

    return new WalletAccountSolana(signer, this._accountConfig())
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
