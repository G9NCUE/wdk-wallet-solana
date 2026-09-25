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
    constructor(seedOrSigner: string | Uint8Array | ISignerSolana, config?: SolanaWalletConfig);
    /**
     * If true, disposes the default signer when the manager is disposed: only a seed signer the
     * manager built itself. A signer you pass in, as default or by name, stays yours to dispose.
     *
     * @private
     * @type {boolean}
     */
    private _shouldWipeDefaultSignerOnDisposal;
    /**
     * A Solana RPC client for HTTP requests.
     *
     * @protected
     * @type {SolanaRpc | undefined}
     */
    protected _rpc: SolanaRpc | undefined;
    /**
     * The commitment level for transactions.
     *
     * @protected
     * @type {Commitment}
     */
    protected _commitment: Commitment;
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
    getAccount(index?: number, options?: {
        signerName?: string;
    }): Promise<WalletAccountSolana>;
    /**
     * Returns the wallet account of a signer registered by name with {@link addSigner}: the signer's
     * own account for a signer that cannot derive, its first account for one that can.
     *
     * @overload
     * @param {string} signerName - The signer name.
     * @returns {Promise<WalletAccountSolana>} The account.
     * @throws {NoSuchElementError} If no signer exists with the given name.
     */
    getAccount(signerName: string): Promise<WalletAccountSolana>;
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
    getAccountByPath(path: string, options?: {
        signerName?: string;
    }): Promise<WalletAccountSolana>;
    /**
     * Builds the account of a signer, its address resolved (a remote signer is asked once, here).
     *
     * @private
     * @param {ISignerSolana} signer - The signer.
     * @param {boolean} shouldWipeSignerOnDisposal - Whether the account owns the signer (one the manager derived).
     * @returns {Promise<WalletAccountSolana>} The account.
     */
    private _accountOf;
    /**
     * Builds the account config, injecting the manager's shared rpc client so accounts reuse
     * it instead of opening their own.
     *
     * @private
     * @returns {SolanaWalletConfig} The account configuration.
     */
    private _accountConfig;
    /**
     * Returns the current fee rates.
     *
     * @returns {Promise<FeeRates>} The fee rates (in lamports).
     * @throws {ProviderRequiredError} If the wallet is not connected to a provider.
     */
    getFeeRates(): Promise<FeeRates>;
}
export type SolanaRpc = ReturnType<typeof import("@solana/rpc").createSolanaRpc>;
export type Commitment = import("@solana/rpc-types").Commitment;
export type FeeRates = import("@tetherto/wdk-wallet").FeeRates;
export type SolanaWalletConfig = import("./wallet-account-solana.js").SolanaWalletConfig;
export type ISignerSolana = import("./signers/signer-solana.js").ISignerSolana;
import WalletManager from "@tetherto/wdk-wallet";
import WalletAccountSolana from "./wallet-account-solana.js";
