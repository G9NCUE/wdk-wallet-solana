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
export default class LedgerSignerSolana extends ISignerSolana implements ISignerSolana {
    /**
     * Creates a Ledger signer.
     *
     * @param {LedgerSignerSolanaOptions} options - The options.
     * @throws {ValueError} If no DeviceManagementKit is given, or if the path is not fully hardened.
     */
    constructor({ dmk, path, buildSignerSolana }?: LedgerSignerSolanaOptions);
    /** @private */
    private _dmk;
    /** @private */
    private _buildSignerSolana;
    /** @private */
    private _path;
    /** @private */
    private _isChild;
    /**
     * Shared by reference between a root and its children: the session, the kit's signer on it, the
     * connection in progress, and whether the root was disposed.
     *
     * @private
     */
    private _session;
    /** @private */
    private _address;
    /** @private */
    private _publicKey;
    /**
     * Derives a child signer, on the same device session.
     *
     * @param {string} relPath - The path relative to m/44'/501' (e.g. "0'/0'").
     * @returns {Promise<LedgerSignerSolana>} The child signer.
     * @throws {InvalidSignerError} If the signer is a derived child.
     */
    derive(relPath: string): Promise<LedgerSignerSolana>;
    /**
     * The derivation path as the signer kit wants it, without the "m/" prefix.
     *
     * @private
     * @type {string}
     */
    private get _devicePath();
    /**
     * Connects on first use and checks that the device is unlocked and reachable.
     *
     * @private
     * @returns {Promise<any>} The kit's SignerSolana.
     */
    private _ready;
    /**
     * Opens the device session, once: accounts resolved together share the connection in progress, or
     * each would prompt for the device.
     *
     * @private
     * @returns {Promise<void>}
     */
    private _connectOnce;
    /** @private */
    private _connect;
    /**
     * Waits for a device action to finish and returns its output.
     *
     * @private
     * @param {{ observable: any }} action - The device action.
     * @returns {Promise<any>} The action's output.
     */
    private _run;
}
export type KeyPair = import("@tetherto/wdk-wallet").KeyPair;
export type LedgerSignerSolanaOptions = {
    /**
     * - A Ledger DeviceManagementKit, built by the application with the transport it uses (WebHID, WebBLE, node-hid…).
     */
    dmk: any;
    /**
     * - The account's path relative to m/44'/501' (default: "0'/0'").
     */
    path?: string;
    /**
     * - Builds the kit's SignerSolana on a session; defaults to `SignerSolanaBuilder` from `@ledgerhq/device-signer-kit-solana`.
     */
    buildSignerSolana?: (args: {
        dmk: any;
        sessionId: string;
    }) => Promise<any>;
};
import { ISignerSolana } from './signer-solana.js';
