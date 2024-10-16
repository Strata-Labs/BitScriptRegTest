//walletManagement.ts;

import * as bitcoin from "bitcoinjs-lib";
import * as bip32 from "bip32";
import {
  Signer,
  SignerAsync,
  ECPairInterface,
  ECPairFactory,
  ECPairAPI,
  TinySecp256k1Interface,
} from "ecpair";
import * as crypto from "crypto";
import * as bip341 from "bitcoinjs-lib/src/payments/bip341";

// You need to provide the ECC library. The ECC library must implement
// all the methods of the `TinySecp256k1Interface` interface.
const tinysecp: TinySecp256k1Interface = require("tiny-secp256k1");
const ECPair: ECPairAPI = ECPairFactory(tinysecp);

import {
  createDescriptorWallet,
  createInitWallet,
  createRawTransaction,
  createTaprootAddress,
  createWallet,
  decodeRawTransaction,
  dumpPrivKey,
  generateToAddress,
  getAddressesByLabel,
  getAddressInfo,
  getBlock,
  getBlockChainInfo,
  getBlockHash,
  getNewAddress,
  getNewAddressByLabel,
  getRawTransaction,
  getTransactionStatus,
  getWalletDescriptor,
  getWalletInfo,
  importAddress,
  importPrivKey,
  listAddressGroupings,
  listLabels,
  listTransactions,
  listUnspent,
  listWallets,
  loadWallet,
  mineBlock,
  scanTxOutSet,
  sendRawTransaction,
  signRawTransactionWithWallet,
  unloadWallet,
} from "./rpcCommands";
import {
  BitcoinNetwork,
  getP2pkh,
  getP2TR,
  getP2WSH,
  getPrivateKeyFromP2tr,
  getPrivateKeysFromSeed,
  hexToUint8Array,
  privateKeyToWIF,
  uint8ArrayToHexString,
} from "./wallet";
import { createAndSignTaprootTransactionWithScripts } from "./depositRequest";
import { DEPOSIT_SEED_PHRASE, SIGNER_SEED_PHRASE } from "./lib";

const WALLET_NAME = "sbtcWallet";

const CURRENT_WORKING_WALLET = "bcrt1qel4k2g5zv9mfws3s6ktl05lzplt2xjf6p40fne";
const CURRENT_WORKING_SENDER_WALLET =
  "bcrt1q57df9qre35sp9ppnrqqh5gqk24wazrf3s79pwx";
export const startUp = async () => {
  try {
    // get currnet blockchain info
    const blockChainInfo = await getBlockChainInfo();
    console.log("blockChainInfo", blockChainInfo);

    const listWalletsRes = await listWallets();
    console.log("listWalletsRes", listWalletsRes);

    if (listWalletsRes && listWalletsRes.length === 1) {
      const walletAddress = await getNewAddress();
      console.log("walletAddress", walletAddress);

      const genTo = await generateToAddress({
        address: walletAddress,
        nblocks: 101,
      });

      console.log("genTo", genTo);

      const listUnspentres = await listUnspent({
        minconf: 0,
        maxconf: 9999999,
        addresses: [walletAddress],
      });

      console.log("listUnspentres", listUnspentres);
    } else {
      // create a new wallet

      const createWalletRes = await createWallet(WALLET_NAME);
      console.log("createWalletRes", createWalletRes);
      // get the new address from the wallet
      const newAddy = await createTaprootAddress(WALLET_NAME);
    }
  } catch (err: any) {
    console.log("err", err);
    throw new Error(err);
  }
};

const sendFundsBetweenAddresses = async (
  senderAddy: string,
  receiverAddy: string,
  amount: number
) => {
  try {
    // Step 3: List UTXOs for the sender wallet address

    const utxosRes = await scanTxOutSet(senderAddy);
    //console.log("utxosRes", utxosRes);

    // const utxos = await listUnspent({
    //   minconf: 0,
    //   maxconf: 9999999,
    //   addresses: [senderAddy],
    // });
    if (utxosRes.unspent === 0)
      throw new Error(`No UTXOs available for address ${senderAddy}`);

    let totalInput = 0;
    const inputs = [];
    for (const utxo of utxosRes.unspents) {
      inputs.push({
        txid: utxo.txid,
        vout: utxo.vout,
      });
      totalInput += utxo.amount;
      if (totalInput >= amount) break; // Stop when we have enough inputs
    }

    if (totalInput < amount) throw new Error("Insufficient funds");

    const fee = 0.002; // Example fee (0.0001 BTC)

    // Step 5: Create transaction outputs (including change if necessary)
    const outputs: any = {};
    outputs[receiverAddy] = amount;

    // Add change output if there are leftover BTC

    const change = totalInput - amount - fee;
    if (change > 0) {
      outputs[senderAddy] = change; // Send change back to sender
    }
    console.log("inputs", inputs);

    console.log("Outputs:", outputs);
    // Step 6: Create the raw transaction
    const rawTxHex = await createRawTransaction(inputs, outputs);
    console.log("Raw Transaction Hex:", rawTxHex);

    // Step 7: Sign the raw transaction with the sender's wallet
    const signedTx = await signRawTransactionWithWallet(rawTxHex);
    console.log("Signed Transaction Hex:", signedTx);

    // ensure the transaction is signed and right by decoding it
    const decodedTx = await decodeRawTransaction(signedTx.hex);
    console.log("decodedTx", decodedTx);

    // Step 8: Send the signed transaction to the Bitcoin network
    const txId = await sendRawTransaction(signedTx.hex);
    console.log("Transaction ID:", txId);

    return txId;
  } catch (err: any) {
    throw new Error(err);
  }
};

export const mineAndCheckId = async (txId: string) => {
  try {
    const blockChainInfo = await getBlockChainInfo();
    console.log("blockChainInfo", blockChainInfo);

    await mineBlock(CURRENT_WORKING_WALLET, 1000); // Mine 1 block

    const blockChainInfo2 = await getBlockChainInfo();
    console.log("blockChainInfo2", blockChainInfo2);

    // Step 3: Check the status of the transaction
    const txStatus = await getTransactionStatus(txId);
    console.log("Transaction Status:", txStatus);
  } catch (err: any) {
    throw new Error(err);
  }
};

export const checkTxStatus = async (txId: string) => {
  try {
    const txStatus = await getTransactionStatus(txId);
    console.log("Transaction Status:", txStatus);
  } catch (err: any) {
    throw new Error(err);
  }
};

export const createP2trAddy = async (seed: string) => {
  try {
    const network: BitcoinNetwork = "regtest";

    const privateKey = getPrivateKeysFromSeed(SIGNER_SEED_PHRASE);

    const senderPrivKeyWIF = privateKeyToWIF(privateKey, network);
    const _network = bitcoin.networks.regtest;

    const keyPair = ECPair.fromWIF(senderPrivKeyWIF, _network);

    const getP2TRRes = getP2TR(SIGNER_SEED_PHRASE);

    //const internalPubkey = keyPair.publicKey.slice(1); // Extract x-only public key (Taproot internal key)

    const internalPubkey = getP2TRRes.pubkey;
    const merkleRootHash =
      "5e06c836f5ed227d8c2397d8a5470e332da913be5f80d864b2b1bd68d7f92e85";

    const merkleRootHashToUint8Array = hexToUint8Array(merkleRootHash);

    const tweak = bip341.tapTweakHash(
      internalPubkey,
      merkleRootHashToUint8Array
    );

    const taprootPubKey = bip341.tweakKey(internalPubkey, tweak);

    const p2tr = bitcoin.payments.p2tr({
      pubkey: taprootPubKey.x,
      network: _network,
    });

    console.log("P2TR Address:", p2tr.address);
  } catch (err: any) {
    throw new Error(err);
  }
};
export const scanTxOutSetHelper = async () => {
  try {
    const signerInfo = getP2TR(SIGNER_SEED_PHRASE);
    console.log("signerInfo", signerInfo);

    console.log("signerInfo.address", signerInfo.address);
    console.log("signerInfo.pubkey", signerInfo.pubkey);
    const getBlockRes = await getBlockHash(5232);
    console.log("getBlockRes", getBlockRes);

    const getBlockHashRes = await getBlock(getBlockRes);
    console.log("getBlockHashRes", getBlockHashRes);

    const res = await scanTxOutSet(
      "bcrt1pcxe5p7krnpyfvnj3vkks7dnrc2ah9h9tn4paurry2qflcmcu5nkq7vfk4y" || ""
    );

    console.log("res", res);
  } catch (err: any) {
    throw new Error(err);
  }
};

export const checkTxStatusHelper = async (txId: string) => {
  try {
    const txStatus = await getRawTransaction(txId);
    console.log("Transaction Status:", JSON.stringify(txStatus, null, 2));
  } catch (err: any) {
    throw new Error(err);
  }
};
export const sendFundsTest = async () => {
  try {
    const p2wsh = getP2WSH(DEPOSIT_SEED_PHRASE);
    if (!p2wsh.address) throw new Error("no address");

    const genTo = await generateToAddress({
      address: p2wsh.address,
      nblocks: 101,
    });

    console.log("genTo", genTo);

    const signerInfo = getP2TR(SIGNER_SEED_PHRASE);

    // sendFundsBetweenAddresses
    const senderAddy = CURRENT_WORKING_WALLET;
    const receiverAddy = signerInfo.address || "";
    const amount = 5;

    const txId = await sendFundsBetweenAddresses(
      senderAddy,
      receiverAddy,
      amount
    );

    await mineAndCheckId(txId);
  } catch (err: any) {
    throw new Error(err);
  }
};

export const importPrivKeyHelper = async () => {
  try {
    const network: BitcoinNetwork = "regtest";

    const p2trTing = getP2TR(DEPOSIT_SEED_PHRASE);
    const address = p2trTing.address;

    const privateKey = getPrivateKeyFromP2tr(DEPOSIT_SEED_PHRASE);
    const senderPrivKeyWIF = privateKeyToWIF(privateKey, network);

    const importPrivRes = await importPrivKey(senderPrivKeyWIF);

    console.log("importPrivRes", importPrivRes);
  } catch (err: any) {
    throw new Error(err);
  }
};

export const importAddressHelper = async () => {
  try {
    const network: BitcoinNetwork = "regtest";

    const p2trTing = getP2TR(DEPOSIT_SEED_PHRASE);
    const address = p2trTing.address;

    const resTing = await scanTxOutSet(address || "");
    console.log("resTing", resTing);
    console.log("address", address);
    const importAddressRes = await importAddress(address || "");

    console.log("importAddressRes", importAddressRes);
  } catch (err: any) {
    throw new Error(err);
  }
};
