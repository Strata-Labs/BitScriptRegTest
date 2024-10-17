import * as bitcoin from "bitcoinjs-lib";
import * as bip32 from "bip32";
import { ECPairFactory, ECPairAPI, TinySecp256k1Interface } from "ecpair";
import * as crypto from "crypto";

import { sha256 } from "@noble/hashes/sha256";

import { listUnspent, scanTxOutSet } from "./rpcCommands";
import {
  BitcoinNetwork,
  createUnspendableTaprootKey,
  getP2pkh,
  getP2TR,
  getPrivateKeyFromP2tr,
  hexToUint8Array,
  privateKeyToWIF,
  uint8ArrayToHexString,
} from "./wallet";
import { Taptree } from "bitcoinjs-lib/src/types";

import * as bip341 from "bitcoinjs-lib/src/payments/bip341";

import { tapTreeToList } from "bitcoinjs-lib/src/psbt/bip371";

// You need to provide the ECC library. The ECC library must implement
// all the methods of the `TinySecp256k1Interface` interface.
const tinysecp: TinySecp256k1Interface = require("tiny-secp256k1");
const ECPair: ECPairAPI = ECPairFactory(tinysecp);
//depositRequest.ts;

// Helper function to convert a little-endian 8-byte number to big-endian
const flipEndian = (buffer: Uint8Array): Uint8Array => {
  const flipped = new Uint8Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    flipped[i] = buffer[buffer.length - 1 - i];
  }
  return flipped;
};

const createDepositScript = (
  signersPubKey: Uint8Array, // Use Uint8Array instead of Buffer
  maxFee: number,
  recipientBytes: Uint8Array // Use Uint8Array instead of Buffer
) => {
  const opDropData = recipientBytes; // Ensure recipientBytes is a Uint8Array

  // maxFee should be BE its in LE rn

  // Convert maxFee to LE buffer (as an 8-byte buffer)
  const LEmaxFee = Buffer.alloc(8);
  LEmaxFee.writeUInt32LE(maxFee, 0); // We use UInt32LE for writing the fee

  // Convert the little-endian maxFee to big-endian
  const BEmaxFee = flipEndian(LEmaxFee);

  console.log("opDropData", opDropData);

  // concat bemaxfee and opdropdata
  const opDropDataTogether = new Uint8Array(
    BEmaxFee.length + opDropData.length
  );
  console.log("BEmaxFee", BEmaxFee);
  opDropDataTogether.set(BEmaxFee);
  console.log("opDropData", opDropData);
  opDropDataTogether.set(opDropData, BEmaxFee.length);

  console.log("signersPubKey", signersPubKey);

  console.log("opDropDataTogether", opDropDataTogether);

  const ting = bitcoin.script.compile([
    opDropDataTogether,
    bitcoin.opcodes.OP_DROP, // OP_DROP
    //bitcoin.script.number.encode(signersPubKey.length), // Push the signer public key length
    signersPubKey, // Push the signer's public key
    bitcoin.opcodes.OP_CHECKSIG, // OP_CHECKSIG
  ]);

  console.log("ting", ting);
  const hexOfTing = uint8ArrayToHexString(ting);
  console.log("hexOfTing", hexOfTing);
  return ting;
};
//the max fee is 8 bytes, big endian

const createReclaimScript = (
  lockTime: number,
  additionalScriptBytes: Uint8Array // Use Uint8Array for additional script data
): Uint8Array => {
  const { script, opcodes } = bitcoin;

  // Encode lockTime using bitcoin.script.number.encode (ensure minimal encoding)
  const lockTimeEncoded = script.number.encode(lockTime);

  // Combine the script elements into a single Uint8Array
  const lockTimeArray = new Uint8Array(lockTimeEncoded); // Convert Buffer to Uint8Array
  const opCheckSequenceVerify = new Uint8Array([
    opcodes.OP_CHECKSEQUENCEVERIFY,
  ]);

  // Calculate total length of the final Uint8Array
  const totalLength =
    lockTimeArray.length +
    opCheckSequenceVerify.length +
    additionalScriptBytes.length;

  // Create the combined Uint8Array to hold the script
  const reclaimScript = new Uint8Array(totalLength);

  // Set each part of the script
  reclaimScript.set(lockTimeArray, 0); // Set lock time
  reclaimScript.set(opCheckSequenceVerify, lockTimeArray.length); // Set OP_CHECKSEQUENCEVERIFY
  reclaimScript.set(
    additionalScriptBytes,
    lockTimeArray.length + opCheckSequenceVerify.length
  ); // Append additional script

  // Return the combined Uint8Array
  const buildScript = script.compile([
    lockTimeArray,
    opcodes.OP_CHECKSEQUENCEVERIFY,
  ]);
  return buildScript;
};

const createP2WSHScript = (script: Uint8Array, network: bitcoin.Network) => {
  const witnessProgram = new Uint8Array(34);
  // Step 3: Set the first byte to 0x00 (version)
  witnessProgram[0] = 0x00;

  // Step 4: Set the second byte to 0x20 (length of the hash, which is 32 bytes)
  witnessProgram[1] = 0x20;

  const scriptHash = sha256.create().update(script).digest();

  witnessProgram.set(scriptHash, 2);

  // add
  const p2wsh = bitcoin.payments.p2wsh({
    redeem: { output: witnessProgram },
    network,
  }).output;
  console.log("p2wsh", p2wsh);

  return p2wsh;
};

export const createAndSignTaprootTransactionWithScripts = async (
  senderPrivKeyWIF: string,
  receiverAddress: string,
  amount: number,
  signersPublicKey: Uint8Array,
  maxFee: number,
  lockTime: number,
  senderAddress: string
): Promise<string> => {
  const network = bitcoin.networks.regtest;

  const keyPair = ECPair.fromWIF(senderPrivKeyWIF, network);

  // Fetch UTXOs for the sender address
  const utxos: any = [];

  const utxosRes = await scanTxOutSet(senderAddress);

  if (utxosRes) {
    utxosRes.unspents.forEach((utxo: any) => {
      utxos.push({
        txid: utxo.txid,
        vout: utxo.vout,
        amount: utxo.amount,
        scriptPubKey: utxo.scriptPubKey,
      });
    });
  }

  const psbt = new bitcoin.Psbt({ network });

  // Add UTXOs as inputs
  let totalInput = 0;
  for (const utxo of utxos) {
    const script = hexToUint8Array(utxo.scriptPubKey);

    const input = {
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: hexToUint8Array(utxo.scriptPubKey),
        value: BigInt(utxo.amount),
      },
    };

    psbt.addInput(input);
    totalInput += utxo.amount;
    if (totalInput >= amount + maxFee) break;
  }

  const recipientBytes = hexToUint8Array(receiverAddress);
  //  Buffer.from(receiverAddress, "utf8"); // Example encoding for recipient address bytes

  // Create the deposit script
  const depositScript = createDepositScript(
    signersPublicKey,
    maxFee,
    recipientBytes
  );

  console.log("depositScript", depositScript);
  const danielDeposit = uint8ArrayToHexString(depositScript);
  console.log("danielDeposit", danielDeposit);

  console.log("depositScript", depositScript);
  console.log("0x3");

  console.log("0x4");

  // Hash the deposit script to create the P2WSH output
  const depositP2WSH = createP2WSHScript(depositScript, network);

  console.log("depositP2WSH", depositP2WSH);

  // Create the reclaim script (lock time + additional script bytes)
  const reclaimScript = createReclaimScript(lockTime, new Uint8Array([]));

  const danielHexReclaim = uint8ArrayToHexString(reclaimScript);
  console.log("danielHexReclaim", danielHexReclaim);

  // Hash the reclaim script to create the P2WSH output
  const reclaimP2WSH = createP2WSHScript(reclaimScript, network);

  console.log("reclaimP2WSH", reclaimP2WSH);

  if (!depositP2WSH || !reclaimP2WSH) {
    throw new Error("Failed to create P2WSH output");
  }

  // Add the deposit output with the deposit script
  psbt.addOutput({
    script: depositP2WSH, // P2WSH output for the deposit script
    value: BigInt(amount),
  });

  console.log("0x5");

  // Add the reclaim output with the reclaim script
  psbt.addOutput({
    script: reclaimScript, // P2WSH output for the reclaim script
    value: BigInt(amount),
  });

  console.log("totalInput,", totalInput);

  // Add change output back to sender if necessary
  const change = totalInput - amount - maxFee;
  if (change > 0) {
    psbt.addOutput({
      address: senderAddress, // Change goes back to the sender
      value: BigInt(change),
    });
  }

  console.log("psbt", psbt);
  // Sign the transaction using the sender's private key
  psbt.signAllInputs(keyPair);

  console.log("post psbt sign");
  // Finalize all inputs
  psbt.finalizeAllInputs();

  // Extract the raw transaction
  const _rawTx = psbt.extractTransaction();

  console.log("rawTx", _rawTx);
  const rawTx = _rawTx.toHex();
  return rawTx;
};

type DepositRequest = {
  senderPrivKeyWIF: string;
  receiverAddress: string;
  amount: number;
  signersPublicKey: Uint8Array;
  maxFee: number;
  lockTime: number;
  senderAddress: string;
};

// convert uint8array to buffer
const uint8ArrayToBuffer = (uint8Array: Uint8Array) => {
  return Buffer.from(uint8Array);
};

function toXOnly(pubkey: Buffer): Buffer {
  return pubkey.subarray(1, 33);
}

export const createDepositScriptP2TROutput = async (
  senderPrivKeyWIF: string,
  stxDepositAddress: string,
  amount: number,
  signersPublicKey: Uint8Array,
  maxFee: number,
  lockTime: number,
  senderAddress: string,
  signerAddress: string
) => {
  try {
    // const internalPubkey = hexToUint8Array(
    //   "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0"
    // );

    /* 
      couple steps that make this up - going try to detail in chapters sort of language 
      1. create the reclaim script
      2. create the deposit script
      3. hash the leaf scripts using toHashTree
      4. create an internal public key (tapTweakHash)
      5. create the taprootPubKey 
      6. create the pt2r payment object
      7 basic validation for the payment object
      8. fetch UTXOs for the sender address
      9. add UTXOs as inputs based on the amount being sent
      10. add output for the deposit
      11. calculate a change output if needed
      12. sign and finalize the inputs
      13. extract the raw transaction

    */
    const internalPubkey = hexToUint8Array(
      "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0"
    );

    console.log("bip341,again ", bip341);
    const network = bitcoin.networks.regtest;

    // Create the reclaim script and convert to Buffer
    const reclaimScript = Buffer.from(
      createReclaimScript(lockTime, new Uint8Array([]))
    );

    const reclaimScriptHex = uint8ArrayToHexString(reclaimScript);
    console.log("reclaimScriptHex", reclaimScriptHex);

    // Create the deposit script and convert to Buffer
    console.log("stxDepositAddress", stxDepositAddress);
    const recipientBytes = Buffer.from(hexToUint8Array(stxDepositAddress));
    const depositScript = Buffer.from(
      createDepositScript(internalPubkey, maxFee, recipientBytes)
    );
    // convert buffer to hex
    const depositScriptHexPreHash = uint8ArrayToHexString(depositScript);
    console.log("depositScriptHexPreHash", depositScriptHexPreHash);
    console.log("depositScript", depositScript);

    // // Hash the leaf scripts using tapLeafHash
    const depositScriptHash = bip341.tapleafHash({ output: depositScript });
    console.log("depositScriptHash", depositScriptHash);
    const depositScriptHashHex = uint8ArrayToHexString(depositScriptHash);
    console.log("depositScriptHashHex", depositScriptHashHex);

    const reclaimScriptHash = bip341.tapleafHash({ output: reclaimScript });
    console.log("reclaimScriptHash", reclaimScriptHash);
    const reclaimScriptHashHex = uint8ArrayToHexString(reclaimScriptHash);
    console.log("reclaimScriptHashHex", reclaimScriptHashHex);
    // Combine the leaf hashes into a Merkle root using tapBranch
    const merkleRoot = bip341.toHashTree([
      { output: depositScript },
      { output: reclaimScript },
    ]);

    const scriptTree: Taptree = [
      {
        output: depositScript,
      },
      {
        output: reclaimScript,
      },
    ];

    console.log("merkleRoot", merkleRoot);

    const merkleRootHex = uint8ArrayToHexString(merkleRoot.hash);
    console.log("merkleRootHex", merkleRootHex);
    // Create an internal public key (replace with actual internal public key if available)

    console.log("internalPubkey", internalPubkey);
    // Create the final taproot public key by tweaking internalPubkey with merkleRoot

    console.log("merkleRoot.hash", merkleRoot.hash);
    // Step 1: Generate the tweak
    const tweak = bip341.tapTweakHash(internalPubkey, merkleRoot.hash);
    console.log("tweak", tweak);
    const tweakHex = uint8ArrayToHexString(tweak);
    console.log("tweakHex", tweakHex);
    // Step 2: Apply the tweak to the internal public key to get the tweaked Taproot output key
    const taprootPubKey = bip341.tweakKey(internalPubkey, tweak);
    console.log("taprootPubKey", taprootPubKey);

    const taprootPubKeyHex = uint8ArrayToHexString(taprootPubKey.x);

    console.log("taprootPubKeyHex", taprootPubKeyHex);

    // Step 1: Convert the Taproot public key to a P2TR address
    const p2tr: any = bitcoin.payments.p2tr({
      internalPubkey: internalPubkey, // The tweaked Taproot public key
      network: bitcoin.networks.regtest, // Use the correct network (mainnet or testnet)
      scriptTree: scriptTree,
    });

    // key: toXOnly(keypair.publicKey),
    // Validate the output script is correct (P2TR has a specific witness program structure)
    const outputScript = p2tr.output;
    if (outputScript) {
      const isValid = outputScript.length === 34 && outputScript[0] === 0x51; // P2TR is version 1 witness program
      console.log("P2TR Output Script:", outputScript.toString("hex"));
      console.log("Is valid P2TR output:", isValid);
    } else {
      console.error("Failed to generate P2TR output.");
    }

    console.log("p2tr 0x01", p2tr.address);

    // Fetch UTXOs for the sender address
    const utxos: any = [];
    const utxosRes = await scanTxOutSet(senderAddress);

    if (utxosRes) {
      utxosRes.unspents.forEach((utxo: any) => {
        utxos.push({
          txid: utxo.txid,
          vout: utxo.vout,
          amount: BigInt(Math.round(utxo.amount * 100000000)),
          scriptPubKey: utxo.scriptPubKey,
        });
      });
    }

    const psbt = new bitcoin.Psbt({ network });

    // Add UTXOs as inputs
    let totalInput = BigInt(0);
    for (const utxo of utxos) {
      const script = Buffer.from(hexToUint8Array(utxo.scriptPubKey));
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script,
          value: BigInt(utxo.amount),
        },
      });
      totalInput += BigInt(utxo.amount);
      if (totalInput >= BigInt(amount) + BigInt(maxFee)) break;
    }

    if (p2tr === undefined && p2tr.address === undefined) {
      throw new Error("Output is undefined");
    }

    console.log("we made it here p2tr", p2tr);

    // Add output for the deposit
    psbt.addOutput({
      value: BigInt(amount),
      address: p2tr.address, // Use the P2TR output script
    });

    // Calculate change and add change output if necessary
    const change = BigInt(totalInput) - BigInt(amount) - BigInt(maxFee);

    console.log("change", change);
    if (change > 0) {
      psbt.addOutput({
        address: senderAddress,
        value: BigInt(change),
      });
    }

    console.log("psbt", psbt);

    const keyPair = ECPair.fromWIF(senderPrivKeyWIF, network);

    // Sign the transaction with the sender's private key
    psbt.signAllInputs(keyPair);

    console.log("post psbt sign");

    // Finalize all inputs
    psbt.finalizeAllInputs();

    // Extract the raw transaction
    const _rawTx = psbt.extractTransaction();

    console.log("rawTx", _rawTx);
    const rawTx = _rawTx.toHex();

    return rawTx;
  } catch (err: any) {
    console.error("createDepositScriptP2TROutput error", err);
    throw new Error(err);
  }
};

/*
1e00000000000003e8051aaf3f91f38aa21ade7e9f95efdbc4201eeb4cf0f87520e89877c40fd5b1ef12c3389f6921cb2c00d4fede6564c01ca759d413aab0b312ac


1e00000000000003e8051aaf3f91f38aa21ade7e9f95efdbc4201eeb4cf0f875201e2cd43aa1993fa0c794bdb6d46bf020b8ac8e94b4ba8ef0afdf4bc7e7c69a18ac

*/
