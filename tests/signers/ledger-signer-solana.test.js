'use strict'

import { describe, it, expect, jest } from '@jest/globals'
import { getAddressEncoder } from '@solana/addresses'
import { getBase58Decoder } from '@solana/codecs'
import { getBase64EncodedWireTransaction } from '@solana/transactions'
import * as curve from '@noble/ed25519'
import { InvalidSignerError } from '@tetherto/wdk-wallet'
import WalletManagerSolana from '../../src/wallet-manager-solana.js'
import LedgerSignerSolana from '../../src/signers/ledger-signer-solana.js'
import { SeedSignerSolana } from '../../src/signers/index.js'
import { getOffchainMessages } from '../../src/offchain-message.js'

const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const ADDRESS_0 = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk'
const TEST_RPC_URL = 'https://mockurl.com'
const BLOCKHASH = '6JbYxigC1rn83PMHZait5FHHpC3YqUMacnVJWFwfoayQ'

// the V0 and Legacy off-chain messages of "wdk signers demo" at ADDRESS_0 (pinned to the kit's bytes in offchain-message.test.js)
const [OFFCHAIN_V0, OFFCHAIN_LEGACY] = getOffchainMessages(Buffer.from('wdk signers demo'), getAddressEncoder().encode(ADDRESS_0))

// The kits' observables are rxjs ones; the signer only calls subscribe, so a minimal one does here.
class Observable {
  constructor (producer) { this._producer = producer }

  subscribe (observer) {
    this._producer(observer)
    return { unsubscribe () {} }
  }
}

// a device action as the kit emits it: pending, then completed (or failed)
const action = (produce) => ({
  observable: new Observable(subscriber => {
    subscriber.next({ status: 'pending' })
    Promise.resolve().then(produce).then(
      output => { subscriber.next({ status: 'completed', output }); subscriber.complete() },
      error => { subscriber.next({ status: 'error', error }); subscriber.complete() }
    )
  })
})

// A DeviceManagementKit and a Solana app on the seed's keys: it signs what the real app signs.
function fakeLedger ({ deviceStatus = 'CONNECTED', firmware = 'current', envelope, connect } = {}) {
  const calls = []
  const seed = new SeedSignerSolana(SEED_PHRASE)
  const keyOf = async (devicePath) => (await seed.derive(devicePath.replace(/^44'\/501'\//, ''))).keyPair.privateKey
  const dmk = {
    startDiscovering: () => new Observable(s => { s.next({ id: 'nano' }) }),
    connect: async () => { await connect?.(); calls.push('connect'); return `session-${calls.filter(c => c === 'connect').length}` },
    getDeviceSessionState: () => new Observable(s => { s.next({ deviceStatus: typeof deviceStatus === 'function' ? deviceStatus() : deviceStatus }) }),
    disconnect: async ({ sessionId }) => { calls.push(`disconnect ${sessionId}`) }
  }
  const buildSignerSolana = async ({ sessionId }) => ({
    getAddress: (path, options) => {
      calls.push(`getAddress ${path} ${JSON.stringify(options)}`)
      return action(async () => (await seed.derive(path.replace(/^44'\/501'\//, ''))).address)
    },
    signTransaction: (path, bytes) => {
      calls.push(`signTransaction ${path}`)
      return action(async () => curve.sign(bytes, await keyOf(path)))
    },
    signMessage: (path, message, options) => {
      calls.push(`signMessage ${path} ${JSON.stringify(options)}`)
      if (firmware === 'stopped') return { observable: new Observable(s => { s.next({ status: 'stopped' }) }) }
      return action(async () => {
        if (message !== 'wdk signers demo') throw new Error('the fake only knows the vector message')
        const signed = firmware === 'current' ? OFFCHAIN_V0 : OFFCHAIN_LEGACY
        const signature = curve.sign(signed, await keyOf(path))
        return { signature: envelope ?? getBase58Decoder().decode(Uint8Array.from([1, ...signature, ...signed])) }
      })
    }
  })
  return { dmk, buildSignerSolana, calls }
}

const mockRpc = () => ({
  getLatestBlockhash: jest.fn().mockReturnValue({
    send: jest.fn().mockResolvedValue({ value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1000000 } })
  })
})

describe('LedgerSignerSolana', () => {
  it('needs a DeviceManagementKit and a fully hardened path', () => {
    expect(() => new LedgerSignerSolana({})).toThrow('A Ledger DeviceManagementKit is required.')
    expect(() => new LedgerSignerSolana({ ...fakeLedger(), path: "0'/0" })).toThrow('must be hardened')
  })

  it('reads the address on the device at the path without "m/", and never exposes a private key', async () => {
    const { calls, ...ledger } = fakeLedger()
    const signer = new LedgerSignerSolana(ledger)

    expect(signer.address).toBeUndefined()
    expect(await signer.getAddress()).toBe(ADDRESS_0)
    expect(signer.path).toBe("m/44'/501'/0'/0'")
    expect(signer.keyPair.privateKey).toBeNull()
    expect(signer.keyPair.publicKey.length).toBe(32)
    expect(calls).toContain('getAddress 44\'/501\'/0\'/0\' {"checkOnDevice":false}')
  })

  it('backs a wallet: three accounts resolved together share one connection, as the seed derives them', async () => {
    const { calls, ...ledger } = fakeLedger()
    const wallet = new WalletManagerSolana(new LedgerSignerSolana(ledger), { provider: TEST_RPC_URL })
    const seed = new WalletManagerSolana(SEED_PHRASE, { provider: TEST_RPC_URL })

    const accounts = await Promise.all([0, 1, 2].map(i => wallet.getAccount(i)))

    expect(calls.filter(c => c === 'connect')).toHaveLength(1)
    for (const [i, account] of accounts.entries()) {
      expect(await account.getAddress()).toBe(await (await seed.getAccount(i)).getAddress())
    }
  })

  it('signs a transaction on the device: byte-identical to the seed account', async () => {
    const ledger = fakeLedger()
    const wallet = new WalletManagerSolana(new LedgerSignerSolana(ledger), { provider: TEST_RPC_URL })
    const seed = new WalletManagerSolana(SEED_PHRASE, { provider: TEST_RPC_URL })
    const [a, b] = [await wallet.getAccount(1), await seed.getAccount(1)]
    a._rpc = mockRpc()
    b._rpc = mockRpc()

    const tx = { to: ADDRESS_0, value: 1000n }
    expect(getBase64EncodedWireTransaction(await a.signTransaction(tx))).toBe(getBase64EncodedWireTransaction(await b.signTransaction(tx)))
  })

  it('signs a message as a V0 off-chain message, which a read-only account verifies', async () => {
    const { calls, ...ledger } = fakeLedger()
    const wallet = new WalletManagerSolana(new LedgerSignerSolana(ledger), { provider: TEST_RPC_URL })
    const account = await wallet.getAccount(0)

    const signature = await account.sign('wdk signers demo')

    expect(calls).toContain('signMessage 44\'/501\'/0\'/0\' {"version":"v0"}')
    expect(signature).toMatch(/^[0-9a-f]{128}$/)
    expect(await (await account.toReadOnlyAccount()).verify('wdk signers demo', signature)).toBe(true)
    expect(await account.verify('wdk signers demo!', signature)).toBe(false)
  })

  it('signs the Legacy off-chain message of older firmware, verified too', async () => {
    const ledger = fakeLedger({ firmware: 'legacy' })
    const account = await new WalletManagerSolana(new LedgerSignerSolana(ledger), { provider: TEST_RPC_URL }).getAccount(0)

    const signature = await account.sign('wdk signers demo')

    expect(await account.verify('wdk signers demo', signature)).toBe(true)
    expect(await account.verify('another message', signature)).toBe(false)
  })

  it('says when the device is locked, and surfaces a failed, a stopped action and a bad envelope', async () => {
    await expect(new LedgerSignerSolana(fakeLedger({ deviceStatus: 'LOCKED' })).getAddress()).rejects.toThrow('The Ledger device is locked.')
    await expect(new LedgerSignerSolana(fakeLedger({ deviceStatus: 'BUSY' })).getAddress()).rejects.toThrow('The Ledger device is busy.')

    await expect(new LedgerSignerSolana(fakeLedger()).sign('not the vector')).rejects.toThrow(InvalidSignerError)

    await expect(new LedgerSignerSolana(fakeLedger({ firmware: 'stopped' })).sign('wdk signers demo')).rejects.toThrow('The Ledger action was stopped on the device.')

    for (const envelope of ['0OIl', getBase58Decoder().decode(new Uint8Array([2, ...new Uint8Array(64)]))]) {
      await expect(new LedgerSignerSolana(fakeLedger({ envelope })).sign('wdk signers demo')).rejects.toThrow('message envelope')
    }
  })

  it('reconnects a device that went away, closing the old session', async () => {
    let status = 'CONNECTED'
    const { calls, ...ledger } = fakeLedger({ deviceStatus: () => status })
    const signer = new LedgerSignerSolana(ledger)
    await signer.getAddress()

    status = 'NOT CONNECTED'
    await signer.signTransactionMessage(new Uint8Array(4))

    expect(calls.filter(c => c === 'connect' || c.startsWith('disconnect'))).toEqual(['connect', 'disconnect session-1', 'connect'])
  })

  it('closes a session that opens after the signer was disposed', async () => {
    let open
    const { calls, ...ledger } = fakeLedger({ connect: () => new Promise(resolve => { open = resolve }) })
    const signer = new LedgerSignerSolana(ledger)

    const pending = signer.getAddress()
    await new Promise(resolve => setTimeout(resolve, 0))
    signer.dispose()
    open()

    await expect(pending).rejects.toThrow('The signer has been disposed.')
    expect(calls).toContain('disconnect session-1')
  })

  it('derives children on the same session; the root closes it once, a child leaves it open', async () => {
    const { calls, ...ledger } = fakeLedger()
    const root = new LedgerSignerSolana(ledger)
    const child = await root.derive("1'/0'")
    await child.getAddress()

    expect(child.isDerivable).toBe(false)
    await expect(child.derive("2'/0'")).rejects.toThrow('Cannot derive')

    child.dispose()
    expect(calls.filter(c => c.startsWith('disconnect'))).toHaveLength(0)

    root.dispose()
    root.dispose()
    expect(calls.filter(c => c.startsWith('disconnect'))).toEqual(['disconnect session-1'])
    await expect(child.signTransactionMessage(new Uint8Array(4))).rejects.toThrow('The signer has been disposed.')
  })
})
