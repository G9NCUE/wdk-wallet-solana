/**
 * A signer on a BIP-39 seed: Ed25519 keys derived with SLIP-0010 at m/44'/501'/<path>. A root signer
 * keeps the master key and derives children; a child keeps its own account only.
 *
 * @implements {ISignerSolana}
 */
export default class SeedSignerSolana extends ISignerSolana implements ISignerSolana {
    /**
     * Creates a seed signer.
     *
     * @param {string | Uint8Array | null} seed - A [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes); null when `opts.root` is given.
     * @param {SeedSignerSolanaOptions} [opts] - The options.
     * @throws {ValueError} If the seed phrase is invalid, if both or neither of a seed and a root are given, or if the path is not fully hardened.
     */
    constructor(seed: string | Uint8Array | null, opts?: SeedSignerSolanaOptions);
    /** @private */
    private _path;
    /**
     * Raw Ed25519 private key bytes (32 bytes).
     *
     * @private
     * @type {Uint8Array | undefined}
     */
    private _privateKey;
    /**
     * Raw Ed25519 public key bytes (32 bytes).
     *
     * @private
     * @type {Uint8Array}
     */
    private _publicKey;
    /** @private */
    private _address;
    /**
     * The SLIP-0010 master key, kept by a root signer only.
     *
     * @private
     * @type {HDKey | undefined}
     */
    private _root;
    /**
     * Derives a child signer.
     *
     * @param {string} relPath - The path relative to m/44'/501' (e.g. "0'/0'").
     * @returns {Promise<SeedSignerSolana>} The child signer.
     * @throws {InvalidSignerError} If the signer has no master key (a child, or a disposed root).
     */
    derive(relPath: string): Promise<SeedSignerSolana>;
    /** @private */
    private _live;
}
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type SeedSignerSolanaOptions = {
    /**
     * - An existing SLIP-0010 master key to derive from, instead of a seed.
     */
    root?: HDKey;
    /**
     * - The account's path relative to m/44'/501' (default: "0'/0'").
     */
    path?: string;
    /**
     * - If true, the signer keeps its own account only, not the master key.
     */
    isChild?: boolean;
};
import { ISignerSolana } from './signer-solana.js';
import HDKey from 'micro-key-producer/slip10.js';
