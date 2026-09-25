'use strict'

import { describe, it, expect } from '@jest/globals'
import { getAddressEncoder } from '@solana/addresses'
import { getOffchainMessages } from '../src/offchain-message.js'

const PUBLIC_KEY = getAddressEncoder().encode('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk')

// built by @ledgerhq/device-signer-kit-solana 1.13.2's OffchainMessageBuilder for PUBLIC_KEY: V0, then Legacy
const VECTORS = {
  'wdk signers demo': [
    'ff736f6c616e61206f6666636861696e0000000000000000000000000000000000000000000000000000000000000000000001f036276246a75b9de3349ed42b15e232f6518fc20f5fcd4f1d64e81f9bd258f7100077646b207369676e6572732064656d6f',
    'ff736f6c616e61206f6666636861696e0000100077646b207369676e6572732064656d6f'
  ],
  'héllo wdk': [
    'ff736f6c616e61206f6666636861696e0000000000000000000000000000000000000000000000000000000000000000000101f036276246a75b9de3349ed42b15e232f6518fc20f5fcd4f1d64e81f9bd258f70a0068c3a96c6c6f2077646b',
    'ff736f6c616e61206f6666636861696e00010a0068c3a96c6c6f2077646b'
  ],
  'line one\nline two': [
    'ff736f6c616e61206f6666636861696e0000000000000000000000000000000000000000000000000000000000000000000001f036276246a75b9de3349ed42b15e232f6518fc20f5fcd4f1d64e81f9bd258f711006c696e65206f6e650a6c696e652074776f',
    'ff736f6c616e61206f6666636861696e000111006c696e65206f6e650a6c696e652074776f'
  ]
}

describe('getOffchainMessages', () => {
  it.each(Object.entries(VECTORS))('builds what the Ledger Solana app signs for %j', (message, expected) => {
    const messages = getOffchainMessages(Buffer.from(message, 'utf8'), PUBLIC_KEY)

    expect(messages.map(bytes => Buffer.from(bytes).toString('hex'))).toEqual(expected)
  })

  it('builds none for a message too long for the u16 length', () => {
    expect(getOffchainMessages(new Uint8Array(0x10000), PUBLIC_KEY)).toEqual([])
  })
})
