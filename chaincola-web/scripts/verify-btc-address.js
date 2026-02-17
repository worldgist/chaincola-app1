// Verify Bitcoin address format and validity
// Usage: node verify-btc-address.js <address>

const address = process.argv[2] || '162emKaWaq84RWFEKYNZx5QLxwTKYSBVTb';

console.log(`🔍 Verifying Bitcoin address: ${address}\n`);

// Check length
if (address.length < 26 || address.length > 35) {
  console.error(`❌ Invalid length: ${address.length} (expected 26-35)`);
  process.exit(1);
}

// Check format
const p2pkhPattern = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
const bech32Pattern = /^bc1[a-z0-9]{39,59}$/i;
const isValidFormat = p2pkhPattern.test(address) || bech32Pattern.test(address);

if (isValidFormat) {
  console.log(`✅ Address format is valid`);
  if (address.startsWith('1')) {
    console.log(`   Type: P2PKH (Legacy)`);
  } else if (address.startsWith('3')) {
    console.log(`   Type: P2SH (Script Hash)`);
  } else if (address.startsWith('bc1')) {
    console.log(`   Type: Bech32 (Native SegWit)`);
  }
} else {
  console.warn(`⚠️  Address format is unusual`);
  console.warn(`   Expected: Starts with 1, 3, or bc1`);
  console.warn(`   Actual: Starts with ${address.substring(0, 3)}`);
  console.warn(`   Length: ${address.length} characters`);
  
  // Try to decode base58 to see what's inside
  try {
    const bs58 = require('bs58');
    const decoded = bs58.decode(address);
    console.log(`\n📊 Base58 Decoded:`);
    console.log(`   Length: ${decoded.length} bytes`);
    console.log(`   First byte (version): 0x${decoded[0].toString(16).padStart(2, '0')}`);
    console.log(`   Expected for mainnet P2PKH: 0x00`);
    console.log(`   Expected for mainnet P2SH: 0x05`);
    console.log(`   Expected for testnet: 0x6f`);
    
    if (decoded.length === 25) {
      const version = decoded[0];
      const hash160 = decoded.slice(1, 21);
      const checksum = decoded.slice(21, 25);
      
      console.log(`\n📦 Address Structure:`);
      console.log(`   Version byte: 0x${version.toString(16).padStart(2, '0')} (${version})`);
      console.log(`   Hash160: ${hash160.length} bytes`);
      console.log(`   Checksum: ${checksum.length} bytes`);
      
      // Verify checksum
      const crypto = require('crypto');
      const versioned = decoded.slice(0, 21);
      const hash1 = crypto.createHash('sha256').update(versioned).digest();
      const hash2 = crypto.createHash('sha256').update(hash1).digest();
      const expectedChecksum = hash2.slice(0, 4);
      const checksumMatch = Buffer.compare(checksum, expectedChecksum) === 0;
      
      console.log(`\n🔐 Checksum Verification:`);
      console.log(`   Expected: ${expectedChecksum.toString('hex')}`);
      console.log(`   Actual:   ${Buffer.from(checksum).toString('hex')}`);
      console.log(`   Match: ${checksumMatch ? '✅' : '❌'}`);
      
      if (checksumMatch) {
        console.log(`\n✅ Address structure is valid!`);
        if (version === 0x00) {
          console.log(`   This is a mainnet P2PKH address but doesn't start with '1'`);
          console.log(`   This is unusual but technically valid (rare base58 encoding)`);
        } else if (version === 0x05) {
          console.log(`   This is a mainnet P2SH address but doesn't start with '3'`);
          console.log(`   This is unusual but technically valid (rare base58 encoding)`);
        } else {
          console.log(`   Version byte ${version} (0x${version.toString(16)}) is not standard`);
        }
      } else {
        console.log(`\n❌ Checksum mismatch - address may be corrupted!`);
      }
    }
  } catch (error) {
    console.error(`\n❌ Error decoding address:`, error.message);
  }
}

console.log('');



