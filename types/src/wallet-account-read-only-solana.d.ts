/**
 * Read-only Solana wallet account implementation.
 */
export default class WalletAccountReadOnlySolana extends WalletAccountReadOnly {
    /**
     * Creates a new solana read-only wallet account.
     *
     * @param {string} addr - The account's address.
     * @param {Omit<SolanaWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>} [config] - The configuration object.
     */
    constructor(addr: string, config?: Omit<SolanaWalletConfig, "transferMaxFee" | "transactionMaxFee">);
    /**
     * The read-only wallet account configuration.
     *
     * @protected
     * @type {Omit<SolanaWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>}
     */
    protected _config: Omit<SolanaWalletConfig, "transferMaxFee" | "transactionMaxFee">;
    /**
     * A Solana RPC client for HTTP requests.
     *
     * @protected
     * @type {SolanaRpc | undefined}
     */
    protected _rpc: SolanaRpc | undefined;
    /**
     * The commitment level for querying transaction and account states.
     * Determines the level of finality required before returning results.
     *
     * @protected
     * @type {Commitment}
     */
    protected _commitment: Commitment;
    /**
     * Returns the account's native SOL balance.
     *
     * @returns {Promise<bigint>} The sol balance (in lamports).
     * @throws {ProviderRequiredError} If the wallet is not connected to a provider.
     */
    getBalance(): Promise<bigint>;
    /**
     * Returns the account balance for a specific SPL token.
     *
     * @param {string} tokenAddress - The smart contract address of the token.
     * @returns {Promise<bigint>} The token balance (in base unit).
     * @throws {ProviderRequiredError} If the wallet is not connected to a provider.
     */
    getTokenBalance(tokenAddress: string): Promise<bigint>;
    /**
     * Returns the account balances for a list of SPL tokens.
     *
     * @param {string[]} tokenAddresses - The smart contract addresses of the tokens.
     * @returns {Promise<Record<string, bigint>>} A mapping of token addresses to their balances (in base units).
     * @throws {ProviderRequiredError} If the wallet is not connected to a provider.
     */
    getTokenBalances(tokenAddresses: string[]): Promise<Record<string, bigint>>;
    /**
     * Quotes the costs of a send transaction operation.
     *
     * @param {SolanaTransaction} tx - The transaction: a native transfer object, a transaction
     *   message, or a base64-encoded serialized transaction.
     * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
     * @throws {ProviderRequiredError} If the wallet is not connected to a provider.
     */
    quoteSendTransaction(tx: SolanaTransaction): Promise<Omit<TransactionResult, "hash">>;
    /**
     * Quotes the costs of a transfer operation.
     *
     * @param {TransferOptions} options - The transfer's options.
     * @param {SolanaTransferOptions} [solanaOptions] - The transfer's Solana-specific options.
     * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
     * @throws {ProviderRequiredError} If the wallet is not connected to a provider.
     */
    quoteTransfer(options: TransferOptions, solanaOptions?: SolanaTransferOptions): Promise<Omit<TransferResult, "hash">>;
    /**
     * Retrieves a transaction receipt by its signature
     *
     * @deprecated Use {@link getTransaction} instead, which returns a normalized, finality-based receipt. The raw transaction remains available on its `transaction` property.
     * @param {string} hash - The transaction's hash.
     * @returns {Promise<SolanaTransactionReceipt | null>} — The receipt, or null if the transaction has not been included in a block yet.
     * @throws {ProviderRequiredError} If the wallet is not connected to a provider.
     * @throws {ValueError} If the hash is not a valid signature.
     */
    getTransactionReceipt(hash: string): Promise<SolanaTransactionReceipt | null>;
    /**
     * Returns a normalized, finality-based receipt for a transaction.
     *
     * @param {string} hash - The transaction's signature.
     * @returns {Promise<TransactionReceipt & SolanaTransactionDetails>} The normalized receipt.
     * @throws {ProviderRequiredError} If the wallet is not connected to a provider.
     * @throws {ValueError} If the hash is not a valid signature.
     * @throws {NoSuchElementError} If no transaction has been found for the given hash.
     */
    getTransaction(hash: string): Promise<TransactionReceipt & SolanaTransactionDetails>;
    /**
     * Blocks until a transaction reaches the requested finality target, or times out.
     *
     * Note: Solana RPC does not expose a `dropped` state. An evicted or never-landed
     * signature simply reports no status, which is indistinguishable from a not-yet-seen
     * transaction and is treated as still-pending. A dropped transaction therefore surfaces
     * as a {@link TimeoutError} rather than resolving to a `dropped` receipt.
     *
     * @param {string} hash - The transaction's signature.
     * @param {WaitForTransactionOptions} [options] - The wait options.
     * @returns {Promise<TransactionReceipt & SolanaTransactionDetails>} The terminal receipt for the finality target reached (inspect `success` to tell success from revert).
     * @throws {TimeoutError} If the target is not reached before the timeout.
     */
    waitForTransaction(hash: string, options?: WaitForTransactionOptions): Promise<TransactionReceipt & SolanaTransactionDetails>;
    /**
     * Builds a transaction message for SPL token transfer.
     * Creates instructions for ATA creation (if needed) and token transfer.
     *
     * @protected
     * @param {string} token - The SPL token mint address (base58-encoded public key).
     * @param {string} recipient - The recipient's wallet address (base58-encoded public key).
     * @param {number | bigint} amount - The amount to transfer in token's base units (must be ≤ 2^64-1).
     * @param {SolanaTransferOptions} [solanaOptions] - The transfer's Solana-specific options.
     * @returns {Promise<TransactionMessage>} The constructed transaction message.
     * @throws {ValueError} If the amount exceeds the representable range, if the memo is not a string, or if the memo makes the transaction exceed the maximum transaction size.
     * @todo Support Token-2022 (Token Extensions Program).
     */
    protected _buildSPLTransferTransactionMessage(token: string, recipient: string, amount: number | bigint, solanaOptions?: SolanaTransferOptions): Promise<TransactionMessage>;
    /**
     * Builds a transaction message for native SOL transfer.
     * Creates a transfer instruction for sending SOL.
     *
     * @protected
     * @param {string} to - The recipient's address.
     * @param {number | bigint} value - The amount of SOL to send (in lamports).
     * @returns {Promise<TransactionMessage>} The constructed transaction message.
     */
    protected _buildNativeTransferTransactionMessage(to: string, value: number | bigint): Promise<TransactionMessage>;
    /**
     * Calculates the fee for a given transaction message.
     *
     * @protected
     * @param {TransactionMessage} transactionMessage - The transaction message to calculate fee for.
     * @returns {Promise<bigint>} The calculated transaction fee in lamports.
     */
    protected _getTransactionFee(transactionMessage: TransactionMessage): Promise<bigint>;
    /**
     * Queries the RPC for the fee of a base64-encoded, compiled transaction message.
     *
     * @protected
     * @param {string} base64EncodedMessage - The base64-encoded compiled transaction message.
     * @returns {Promise<bigint>} The calculated transaction fee in lamports.
     * @throws {ValueError} If the provider cannot compute a fee for the message, e.g. because its blockhash has expired.
     */
    protected _getFeeForBase64Message(base64EncodedMessage: string): Promise<bigint>;
    /**
     * Decodes a base64-encoded serialized transaction.
     *
     * @protected
     * @param {string} serializedTransaction - The base64-encoded serialized transaction.
     * @returns {Transaction} The decoded transaction.
     */
    protected _decodeSerializedTransaction(serializedTransaction: string): Transaction;
    /**
     * Verifies a message's signature.
     *
     * @param {string} message - The original message.
     * @param {string} signature - The signature to verify.
     * @returns {Promise<boolean>} True if the signature is valid.
     */
    verify(message: string, signature: string): Promise<boolean>;
    /**
     * Ensures the transaction has either a blockhash lifetime or a durable nonce lifetime.
     *
     * @protected
     * @param {SolanaTransaction} tx - The transaction.
     * @returns {Promise<SolanaTransaction>} The transaction with lifetime.
     */
    protected _ensureLifetime(tx: SolanaTransaction): Promise<SolanaTransaction>;
    /**
     * Asserts that any explicit transaction fee payer matches this wallet address.
     *
     * @protected
     * @param {SolanaTransaction} tx - The transaction.
     * @returns {Promise<void>} Resolves when the transaction has no explicit fee payer or it matches this wallet address.
     * @throws {ValueError} If the transaction fee payer does not match this wallet address.
     */
    protected _assertFeePayer(tx: SolanaTransaction): Promise<void>;
}
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet").TransferResult;
export type TransactionReceipt = import("@tetherto/wdk-wallet").TransactionReceipt;
export type WaitForTransactionOptions = import("@tetherto/wdk-wallet").WaitForTransactionOptions;
export type TransactionMessage = import("@solana/transaction-messages").TransactionMessage;
export type Transaction = import("@solana/transactions").Transaction;
export type SolanaRpc = ReturnType<typeof import("@solana/rpc").createSolanaRpc>;
export type SolanaTransactionReceipt = ReturnType<import("@solana/rpc-api").SolanaRpcApi["getTransaction"]>;
export type Commitment = import("@solana/rpc-types").Commitment;
/**
 * The Solana-specific fields added to a normalized transaction receipt.
 */
export type SolanaTransactionDetails = {
    /**
     * - The number of confirmations, or null once the transaction is finalized (or when the node no longer reports a count).
     */
    confirmations: number | null;
    /**
     * - The native Solana transaction object, or null while the transaction is pending.
     */
    transaction: SolanaTransactionReceipt | null;
};
/**
 * The Solana-specific options of a transfer operation, next to the chain-agnostic {@link TransferOptions}.
 */
export type SolanaTransferOptions = {
    /**
     * - A UTF-8 memo to attach to the transfer, ignored when empty. It has to be short enough for the transfer to stay within the maximum transaction size. Tokens whose recipient token account enables the memo transfer extension reject transfers that carry none, but that extension is Token-2022 only and this account does not transfer Token-2022 mints yet, so today the memo serves as a payment reference.
     */
    memo?: string;
};
export type SimpleSolanaTransaction = {
    /**
     * - The recipient's Solana address.
     */
    to: string;
    /**
     * - The amount of SOL to send in lamports (1 SOL = 1,000,000,000 lamports).
     */
    value: number | bigint;
};
/**
 * A transaction to operate on: a native transfer object, a transaction message, or a
 * base64-encoded serialized transaction (e.g. a swap or bridge payload built by an
 * external API).
 */
export type SolanaTransaction = SimpleSolanaTransaction | TransactionMessage | string;
export type SolanaWalletConfig = {
    /**
     * - The Solana RPC url. It's also possible to provide an array of urls instead. In such case, connection errors will cause the wallet to automatically fallback on the next provider in the list.
     */
    provider?: string | string[];
    /**
     * - Deprecated alias for `provider`. If both are set, `provider` takes precedence.
     */
    rpcUrl?: string | string[];
    /**
     * - The commitment level (default: 'confirmed').
     */
    commitment?: Commitment;
    /**
     * - If set and if 'provider' is a list of urls, the number of additional retry attempts after the initial call fails. Total attempts = `1 + retries`. For example, `retries: 3` with 4 providers will try each provider once before throwing. If `retries` exceeds the number of providers, the failover will loop back and retry already-failed providers in round-robin order (default: 3).
     */
    retries?: number;
    /**
     * - Maximum allowed fee in lamports for transfer operations.
     */
    transferMaxFee?: number | bigint;
    /**
     * - The maximum fee amount for sendTransaction and signTransaction operations.
     */
    transactionMaxFee?: number | bigint;
};
import { WalletAccountReadOnly } from "@tetherto/wdk-wallet";
