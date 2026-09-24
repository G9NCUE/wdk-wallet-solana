/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
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
    get isDerivable(): boolean;
    /**
     * The full SLIP-0010 derivation path of the signer's account (e.g. "m/44'/501'/0'/0'"), or null
     * for a signer not bound to a path (e.g. a private-key signer).
     *
     * @type {string | null}
     */
    get path(): string | null;
    /**
     * The signer's address, once known. Local signers know it at construction; a remote signer knows
     * it after the first {@link getAddress}.
     *
     * @type {string | undefined}
     */
    get address(): string | undefined;
    /**
     * The signer's key pair. The private key is null for a signer that cannot expose it (a hardware
     * device, a key service) and once the signer has been disposed.
     *
     * @type {KeyPair}
     */
    get keyPair(): KeyPair;
    /**
     * Derives a child signer at a path relative to m/44'/501' (e.g. "0'/0'"). Every level is hardened.
     *
     * @param {string} relPath - The relative derivation path.
     * @returns {Promise<ISignerSolana>} The child signer.
     */
    derive(relPath: string): Promise<ISignerSolana>;
    /**
     * Signs a message: an Ed25519 signature over its UTF-8 bytes.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The signature, hex-encoded.
     */
    sign(message: string): Promise<string>;
    /**
     * Signs a transaction's compiled message. The signer never builds nor sends the transaction: it
     * signs the message bytes, and the account adds the signature to the transaction's signature map.
     *
     * @param {Uint8Array} messageBytes - The compiled transaction message.
     * @returns {Promise<Uint8Array>} The 64-byte Ed25519 signature.
     */
    signTransactionMessage(messageBytes: Uint8Array): Promise<Uint8Array>;
}
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
import { ISigner } from '@tetherto/wdk-wallet';
