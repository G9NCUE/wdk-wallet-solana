// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict'

const SIGNING_DOMAIN = Buffer.from('\xffsolana offchain', 'latin1')

const FORMAT = { ascii: 0, utf8: 1 }

/**
 * Returns the off-chain messages a hardware wallet may sign for a message instead of the message
 * itself (see https://docs.anza.xyz/proposals/off-chain-message-signing): the V0 message, and the
 * Legacy one of older Ledger Solana apps.
 *
 * @param {Uint8Array} messageBytes - The message's bytes.
 * @param {Uint8Array} publicKey - The signer's 32-byte public key.
 * @returns {Uint8Array[]} The off-chain messages, empty if the message is too long for one.
 */
export function getOffchainMessages (messageBytes, publicKey) {
  if (messageBytes.length > 0xffff) {
    return []
  }

  const length = [messageBytes.length & 0xff, messageBytes.length >> 8]

  const v0 = Uint8Array.from([
    ...SIGNING_DOMAIN, 0, ...new Uint8Array(32), formatOf(messageBytes, false), 1, ...publicKey, ...length, ...messageBytes
  ])

  const legacy = Uint8Array.from([
    ...SIGNING_DOMAIN, 0, formatOf(messageBytes, true), ...length, ...messageBytes
  ])

  return [v0, legacy]
}

// printable ASCII (and newlines, except in Legacy) is format 0, anything else UTF-8
function formatOf (messageBytes, legacy) {
  const isAscii = messageBytes.every(byte => (byte >= 0x20 && byte <= 0x7e) || (!legacy && byte === 0x0a))

  return isAscii ? FORMAT.ascii : FORMAT.utf8
}
