/**
 * A signer on a single Ed25519 key: an imported account, a key a service gave out. It has no
 * derivation path and cannot derive; register it by name with `addSigner`.
 *
 * @implements {ISignerSolana}
 */
export default class PrivateKeySignerSolana extends ISignerSolana implements ISignerSolana {
    /**
     * Creates a signer from a private key.
     *
     * @param {string | Uint8Array} secret - The 32-byte private key, or a 64-byte keypair (private key then public key, as `solana-keygen` and wallet exports write it), as bytes or base58.
     * @throws {ValueError} If the secret is neither 32 nor 64 bytes, or if a keypair's public half does not match its private half.
     */
    constructor(secret: string | Uint8Array);
    /** @private */
    private _privateKey;
    /** @private */
    private _publicKey;
    /** @private */
    private _address;
    /**
     * Always null: a raw key has no derivation path.
     *
     * @type {null}
     */
    get path(): null;
    /**
     * A private-key signer cannot derive.
     *
     * @returns {Promise<never>}
     * @throws {InvalidSignerError} Always.
     */
    derive(): Promise<never>;
    /** @private */
    private _live;
}
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
import { ISignerSolana } from './signer-solana.js';
