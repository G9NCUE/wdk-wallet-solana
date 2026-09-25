'use strict'

import { describe, it, expect } from '@jest/globals'
import { getBase58Decoder } from '@solana/codecs'
import { InvalidSignerError } from '@tetherto/wdk-wallet'
import WalletManagerSolana from '../../src/wallet-manager-solana.js'
import { PrivateKeySignerSolana, SeedSignerSolana } from '../../src/signers/index.js'

const TEST_SEED_PHRASE = 'test walk nut penalty hip pave soap entry language right filter choice'
const TEST_RPC_URL = 'https://mockurl.com'

// the seed's account 3, whose key the private-key signer is given in its different forms
const account3 = () => new SeedSignerSolana(TEST_SEED_PHRASE, { path: "3'/0'", isChild: true })

describe('PrivateKeySignerSolana', () => {
  it('takes a 32-byte key, a 64-byte keypair, or either in base58: the same account as the seed at that path', async () => {
    const reference = account3()
    const { privateKey, publicKey } = reference.keyPair
    const keypair = Uint8Array.from([...privateKey, ...publicKey])

    for (const secret of [privateKey, keypair, getBase58Decoder().decode(privateKey), getBase58Decoder().decode(keypair)]) {
      const signer = new PrivateKeySignerSolana(secret)
      expect(await signer.getAddress()).toBe(await reference.getAddress())
      expect(await signer.sign('Dummy message to sign.')).toBe(await reference.sign('Dummy message to sign.'))
      expect(await signer.signTransactionMessage(new Uint8Array([9, 9, 9]))).toEqual(await reference.signTransactionMessage(new Uint8Array([9, 9, 9])))
    }
  })

  it('refuses a secret of the wrong size, and a keypair whose halves do not match', () => {
    const { privateKey } = account3().keyPair
    const other = new SeedSignerSolana(TEST_SEED_PHRASE, { path: "4'/0'", isChild: true }).keyPair.publicKey

    expect(() => new PrivateKeySignerSolana(new Uint8Array(31))).toThrow('A Solana private key is 32 bytes, or a 64-byte keypair.')
    expect(() => new PrivateKeySignerSolana('0OIl not base58')).toThrow('The private key is not valid base58.')
    expect(() => new PrivateKeySignerSolana(Uint8Array.from([...privateKey, ...other]))).toThrow("The keypair's public key does not match its private key.")
  })

  it('is a single account: no path, no derivation, registered by name in a wallet', async () => {
    const signer = new PrivateKeySignerSolana(account3().keyPair.privateKey)
    expect(signer.isDerivable).toBe(false)
    expect(signer.path).toBeNull()
    await expect(signer.derive("0'/0'")).rejects.toThrow(InvalidSignerError)

    const wallet = new WalletManagerSolana(TEST_SEED_PHRASE, { provider: TEST_RPC_URL })
    wallet.addSigner('imported', signer)
    const account = await wallet.getAccount('imported')

    expect(await account.getAddress()).toBe(await account3().getAddress())
    expect(account.path).toBeNull()
    expect(await account.verify('hello', await account.sign('hello'))).toBe(true)
  })

  it('wipes its own copy of the key on dispose, never the caller\'s buffer', async () => {
    const secret = Uint8Array.from(account3().keyPair.privateKey)
    const signer = new PrivateKeySignerSolana(secret)
    const held = signer.keyPair.privateKey

    signer.dispose()

    expect(signer.keyPair.privateKey).toBeNull()
    expect(held.every(byte => byte === 0)).toBe(true)
    expect(secret.some(byte => byte !== 0)).toBe(true)
    await expect(signer.sign('after')).rejects.toThrow('The signer has been disposed.')
  })
})
