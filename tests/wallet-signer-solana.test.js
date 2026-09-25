'use strict'

import { describe, it, expect, jest } from '@jest/globals'
import {
  appendTransactionMessageInstruction,
  createTransactionMessage,
  generateKeyPairSigner,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners
} from '@solana/kit'
import { getTransferSolInstruction } from '@solana-program/system'
import { getBase64EncodedWireTransaction } from '@solana/transactions'
import { InvalidSignerError } from '@tetherto/wdk-wallet'
import WalletManagerSolana from '../src/wallet-manager-solana.js'
import WalletAccountSolana from '../src/wallet-account-solana.js'
import { ISignerSolana, SeedSignerSolana } from '../src/signers/index.js'

const TEST_SEED_PHRASE = 'test walk nut penalty hip pave soap entry language right filter choice'
const TEST_RPC_URL = 'https://mockurl.com'
const BLOCKHASH = '6JbYxigC1rn83PMHZait5FHHpC3YqUMacnVJWFwfoayQ'
const RECIPIENT = '9CXtfmGEtfjmtPKnq2QZcRzCiMzE9T8NQfRicJZetvk2'

// A signer that keeps its key to itself, as a key service or a device does: no private key in its key
// pair, and an address it only learns on the first getAddress(). The keys are the seed's, so its
// accounts can be compared with the seed accounts byte for byte.
class KeyServiceSigner extends ISignerSolana {
  constructor (inner, calls = []) {
    super()
    this._inner = inner
    this._calls = calls
    this._resolved = false
    this._disposed = false
  }

  get isDerivable () { return this._inner.isDerivable }
  get path () { return this._inner.path }
  get address () { return this._resolved ? this._inner.address : undefined }
  get keyPair () { return { privateKey: null, publicKey: this._inner.keyPair.publicKey } }

  async derive (relPath) { return new KeyServiceSigner(await this._inner.derive(relPath), this._calls) }
  async getAddress () { this._resolved = true; return this._inner.address }

  async sign (message) {
    this._live('sign')
    return this._inner.sign(message)
  }

  async signTransactionMessage (messageBytes) {
    this._live('signTransactionMessage')
    return this._inner.signTransactionMessage(messageBytes)
  }

  dispose () { this._disposed = true }

  _live (call) {
    this._calls.push(call)
  }
}

const mockRpc = () => ({
  getLatestBlockhash: jest.fn().mockReturnValue({
    send: jest.fn().mockResolvedValue({ value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1000000 } })
  })
})

function wallets () {
  const calls = []
  const external = new WalletManagerSolana(new KeyServiceSigner(new SeedSignerSolana(TEST_SEED_PHRASE), calls), { provider: TEST_RPC_URL })
  const seed = new WalletManagerSolana(TEST_SEED_PHRASE, { provider: TEST_RPC_URL })
  return { external, seed, calls }
}

describe('WalletAccountSolana on a signer', () => {
  it('refuses a signer whose address is not resolved yet', async () => {
    const signer = new KeyServiceSigner(new SeedSignerSolana(TEST_SEED_PHRASE, { path: "0'/0'", isChild: true }))
    expect(() => new WalletAccountSolana(signer, { provider: TEST_RPC_URL })).toThrow("The signer's address is not known yet")

    await signer.getAddress()
    expect(() => new WalletAccountSolana(signer, { provider: TEST_RPC_URL })).not.toThrow()
  })

  it('gives the same accounts as the seed, without holding a private key', async () => {
    const { external, seed } = wallets()

    for (const index of [0, 1, 2]) {
      const [a, b] = [await external.getAccount(index), await seed.getAccount(index)]
      expect(await a.getAddress()).toBe(await b.getAddress())
      expect(a.path).toBe(b.path)
      expect(a.index).toBe(index)
      expect(a.keyPair.privateKey).toBeNull()
      expect(a.keyPair.publicKey).toEqual(b.keyPair.publicKey)
    }
  })

  it('signs a message through the signer, as the seed account does', async () => {
    const { external, seed, calls } = wallets()
    const [a, b] = [await external.getAccount(1), await seed.getAccount(1)]
    const signature = await a.sign('Dummy message to sign.')

    expect(signature).toBe(await b.sign('Dummy message to sign.'))
    expect(await a.verify('Dummy message to sign.', signature)).toBe(true)
    expect(calls).toEqual(['sign'])
  })

  it('signs a transaction through the signer: byte-identical to the seed account', async () => {
    const { external, seed, calls } = wallets()
    const [a, b] = [await external.getAccount(0), await seed.getAccount(0)]
    a._rpc = mockRpc()
    b._rpc = mockRpc()

    const tx = { to: RECIPIENT, value: 1000000n }
    const [signedA, signedB] = [await a.signTransaction(tx), await b.signTransaction(tx)]

    expect(getBase64EncodedWireTransaction(signedA)).toBe(getBase64EncodedWireTransaction(signedB))
    expect(calls).toEqual(['signTransactionMessage'])
  })

  it('signs a serialized transaction built elsewhere, the account as fee payer', async () => {
    const { external, seed } = wallets()
    const [a, b] = [await external.getAccount(0), await seed.getAccount(0)]
    a._rpc = mockRpc()
    b._rpc = mockRpc()

    const signed = await b.signTransaction({ to: RECIPIENT, value: 1000000n })
    const address = await a.getAddress()
    const unsigned = getBase64EncodedWireTransaction({ ...signed, signatures: { [address]: null } })

    expect(getBase64EncodedWireTransaction(await a.signTransaction(unsigned))).toBe(getBase64EncodedWireTransaction(signed))
  })

  it('signs its part of a transaction another account pays for, both signatures kept', async () => {
    const { external } = wallets()
    const account = await external.getAccount(0)
    const feePayer = await generateKeyPairSigner()

    // the account signs as the source of the transfer, through the kit signer it hands out
    const source = await account._getSigner()
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      m => setTransactionMessageFeePayerSigner(feePayer, m),
      m => setTransactionMessageLifetimeUsingBlockhash({ blockhash: BLOCKHASH, lastValidBlockHeight: 1000000n }, m),
      m => appendTransactionMessageInstruction(getTransferSolInstruction({ source, destination: RECIPIENT, amount: 1n }), m)
    )
    const signed = await signTransactionMessageWithSigners(message)

    expect(Object.keys(signed.signatures).sort()).toEqual([await account.getAddress(), feePayer.address].sort())
    expect(Object.values(signed.signatures).every(signature => signature?.length === 64)).toBe(true)
  })

  it('stops a kit signer handed out before the account was disposed', async () => {
    const { external } = wallets()
    const account = await external.getAccount(0)
    const kept = await account._getSigner()

    account.dispose()

    await expect(kept.signTransactions([{ messageBytes: new Uint8Array(4) }])).rejects.toThrow('The wallet account has been disposed.')
  })

  it('refuses a signature that does not verify against the account, whatever the signer returns', async () => {
    const other = new SeedSignerSolana(TEST_SEED_PHRASE, { path: "9'/0'", isChild: true })

    for (const faulty of [() => new Uint8Array(63), () => 'not bytes', bytes => other.signTransactionMessage(bytes)]) {
      const signer = new SeedSignerSolana(TEST_SEED_PHRASE, { isChild: true })
      signer.signTransactionMessage = faulty
      const account = new WalletAccountSolana(signer, { provider: TEST_RPC_URL })
      account._rpc = mockRpc()

      await expect(account.signTransaction({ to: RECIPIENT, value: 1n })).rejects.toThrow(InvalidSignerError)
    }
  })
})

describe('WalletManagerSolana on a signer', () => {
  it('needs a derivable default signer; a single-key signer is registered by name', async () => {
    const single = new KeyServiceSigner(new SeedSignerSolana(TEST_SEED_PHRASE, { path: "5'/0'", isChild: true }))
    expect(() => new WalletManagerSolana(single, { provider: TEST_RPC_URL })).toThrow(InvalidSignerError)

    const wallet = new WalletManagerSolana(TEST_SEED_PHRASE, { provider: TEST_RPC_URL })
    wallet.addSigner('service', single)
    const account = await wallet.getAccount('service')

    expect(await account.getAddress()).toBe(new SeedSignerSolana(TEST_SEED_PHRASE, { path: "5'/0'" }).address)
    expect(await wallet.getAccount('service')).toBe(account)
    expect(account.keyPair.privateKey).toBeNull()
    await expect(wallet.getAccountByPath("1'/0'", { signerName: 'service' })).rejects.toThrow(InvalidSignerError)
  })

  it('gives a named derivable signer\'s own account by name', async () => {
    const wallet = new WalletManagerSolana(TEST_SEED_PHRASE, { provider: TEST_RPC_URL })
    wallet.addSigner('other', new SeedSignerSolana(TEST_SEED_PHRASE, { path: "3'/0'" }))

    const account = await wallet.getAccount('other')
    expect(account.path).toBe("m/44'/501'/3'/0'")
    expect(account.index).toBe(3)
  })

  it('keeps the seed of a wallet built from one, and derives through a named derivable signer', async () => {
    const wallet = new WalletManagerSolana(TEST_SEED_PHRASE, { provider: TEST_RPC_URL })
    expect(wallet.seed).toBeInstanceOf(Uint8Array)

    wallet.addSigner('other', new KeyServiceSigner(new SeedSignerSolana(TEST_SEED_PHRASE)))
    const named = await wallet.getAccountByPath("2'/0'", { signerName: 'other' })
    expect(await named.getAddress()).toBe(await (await wallet.getAccountByPath("2'/0'")).getAddress())
    expect(named).not.toBe(await wallet.getAccountByPath("2'/0'"))
  })

  it('disposes every account it created, those whose key lives elsewhere included', async () => {
    const { external } = wallets()
    const account = await external.getAccount(0)
    await account.sign('before')

    external.dispose()

    await expect(account.sign('after')).rejects.toThrow('The wallet account has been disposed.')
    await expect(account.sendTransaction({ to: RECIPIENT, value: 1n })).rejects.toThrow('The wallet account has been disposed.')
    expect(account._signer._disposed).toBe(true)
  })

  it('wipes the seed it derived from a phrase, and survives a named signer disposed twice', async () => {
    const wallet = new WalletManagerSolana(TEST_SEED_PHRASE, { provider: TEST_RPC_URL })
    const seed = wallet.seed
    wallet.addSigner('single', new SeedSignerSolana(TEST_SEED_PHRASE, { path: "5'/0'", isChild: true }))
    await wallet.getAccount('single')

    expect(() => wallet.dispose()).not.toThrow()
    expect(seed.every(byte => byte === 0)).toBe(true)
  })
})
