'use strict'

import { describe, it, expect } from '@jest/globals'
import { createKeyPairFromPrivateKeyBytes, signBytes } from '@solana/keys'
import { ISigner } from '@tetherto/wdk-wallet'
import * as bip39 from 'bip39'
import { ISignerSolana, SeedSignerSolana } from '../../src/signers/index.js'

// the SLIP-0010 vector every Solana wallet agrees on for this phrase, at m/44'/501'/0'/0'
const VECTOR_SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const VECTOR_ADDRESS = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk'

const TEST_SEED_PHRASE = 'test walk nut penalty hip pave soap entry language right filter choice'

// an independent reference: the @solana/keys (WebCrypto) signature of the same key over the same bytes
async function referenceSignature (privateKey, bytes) {
  const { privateKey: key } = await createKeyPairFromPrivateKeyBytes(privateKey)
  return await signBytes(key, bytes)
}

describe('SeedSignerSolana', () => {
  it('implements the Solana signer interface', () => {
    const signer = new SeedSignerSolana(TEST_SEED_PHRASE)
    expect(signer).toBeInstanceOf(ISignerSolana)
    expect(signer).toBeInstanceOf(ISigner)
  })

  it('derives the SLIP-0010 vector at m/44\'/501\'/0\'/0\'', async () => {
    const root = new SeedSignerSolana(VECTOR_SEED_PHRASE)
    expect(root.path).toBe("m/44'/501'/0'/0'")
    expect(await root.getAddress()).toBe(VECTOR_ADDRESS)
  })

  it('accepts the raw BIP-32 seed bytes a phrase stands for', async () => {
    expect(await new SeedSignerSolana(bip39.mnemonicToSeedSync(VECTOR_SEED_PHRASE)).getAddress()).toBe(VECTOR_ADDRESS)
  })

  it('refuses an invalid seed phrase, a missing seed, and a seed with a root', () => {
    expect(() => new SeedSignerSolana('invalid word that does not exist test test test test test test test')).toThrow('The seed phrase is invalid.')
    expect(() => new SeedSignerSolana(null)).toThrow('Seed or root is required.')
    const root = new SeedSignerSolana(TEST_SEED_PHRASE)
    expect(() => new SeedSignerSolana(TEST_SEED_PHRASE, { root: root._root })).toThrow('Provide either a seed or a root, not both.')
  })

  it('refuses a path that is not fully hardened', async () => {
    expect(() => new SeedSignerSolana(TEST_SEED_PHRASE, { path: "0'/0" })).toThrow('In Solana, every child path in a derivation path must be hardened.')
    await expect(new SeedSignerSolana(TEST_SEED_PHRASE).derive("1'/0")).rejects.toThrow('must be hardened')
  })

  it('derives children: a root can, a child cannot', async () => {
    const root = new SeedSignerSolana(TEST_SEED_PHRASE)
    expect(root.isDerivable).toBe(true)

    const child = await root.derive("1'/0'")
    expect(child.isDerivable).toBe(false)
    expect(child.path).toBe("m/44'/501'/1'/0'")
    expect(await child.getAddress()).toBe(await new SeedSignerSolana(TEST_SEED_PHRASE, { path: "1'/0'", isChild: true }).getAddress())
    expect(await child.getAddress()).not.toBe(await root.getAddress())

    await expect(child.derive("2'/0'")).rejects.toThrow('Cannot derive')
  })

  it('signs a message as the reference implementation does, hex-encoded', async () => {
    const signer = new SeedSignerSolana(TEST_SEED_PHRASE)
    const message = 'Dummy message to sign.'
    const signature = await signer.sign(message)

    const reference = await referenceSignature(signer.keyPair.privateKey, Buffer.from(message, 'utf8'))
    expect(signature).toBe(Buffer.from(reference).toString('hex'))
  })

  it('signs transaction message bytes: a bare 64-byte signature', async () => {
    const signer = new SeedSignerSolana(TEST_SEED_PHRASE)
    const messageBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const signature = await signer.signTransactionMessage(messageBytes)

    expect(signature).toEqual(await referenceSignature(signer.keyPair.privateKey, messageBytes))
  })

  it('exposes its key pair until disposed; disposed, it wipes the keys and refuses to sign or derive', async () => {
    const root = new SeedSignerSolana(TEST_SEED_PHRASE)
    const { privateKey } = root.keyPair
    const master = root._root.privateKey

    expect(privateKey.length).toBe(32)
    expect(root.keyPair.publicKey.length).toBe(32)

    root.dispose()

    expect(root.keyPair.privateKey).toBeNull()
    expect(privateKey.every(byte => byte === 0)).toBe(true)
    expect(master.every(byte => byte === 0)).toBe(true)
    await expect(root.sign('after')).rejects.toThrow('The signer has been disposed.')
    await expect(root.signTransactionMessage(new Uint8Array(1))).rejects.toThrow('The signer has been disposed.')
    await expect(root.derive("1'/0'")).rejects.toThrow('Cannot derive')

    expect(() => root.dispose()).not.toThrow()
  })

  it('leaves a caller\'s seed bytes alone', () => {
    const seed = bip39.mnemonicToSeedSync(TEST_SEED_PHRASE)
    new SeedSignerSolana(seed).dispose()
    expect(seed).toEqual(bip39.mnemonicToSeedSync(TEST_SEED_PHRASE))
  })
})
