import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory, ECPairAPI, TinySecp256k1Interface } from "ecpair";

// You need to provide the ECC library. The ECC library must implement
// all the methods of the `TinySecp256k1Interface` interface.
const tinysecp: TinySecp256k1Interface = require("tiny-secp256k1");
const ECPair: ECPairAPI = ECPairFactory(tinysecp);

import {
  createTaprootAddress,
  createWallet,
  decodeRawTransaction,
  dumpPrivKey,
  generateToAddress,
  getAddressesByLabel,
  getAddressInfo,
  getBlockChainInfo,
  getNewAddress,
  getNewAddressByLabel,
  getWalletDescriptor,
  getWalletInfo,
  listAddressGroupings,
  listTransactions,
  listUnspent,
  listWallets,
  loadWallet,
  sendRawTransaction,
  testMempoolAccept,
  unloadWallet,
} from "./rpcCommands";
import {
  BitcoinNetwork,
  createUnspendableTaprootKey,
  getP2TR,
  getP2WSH,
  getPrivateKeysFromSeed,
  privateKeyToWIF,
  uint8ArrayToHexString,
} from "./wallet";
import { createDepositScriptP2TROutput } from "./depositRequest";
import { mineAndCheckId } from "./walletManagement";

const startUpFaucet = async () => {
  try {
    // ensure the bitcoind is up and running by checking the chaintip
    const blockChainInfo = await getBlockChainInfo();

    console.log("blockChainInfo", blockChainInfo);

    // in order to check how much the faucet have we have to get all the unspent utxos for this from block to  to block

    // refetch the blockchain info
    const blockChainInfo2 = await getBlockChainInfo();

    const transactions = await listTransactions({
      account: "*", // Fetch for all accounts
      count: 20, // Fetch the last 20 transactions
      skip: 0, // Skip 0 transactions
      includeWatchOnly: true, // Include watch-only addresses
    });
    console.log("transactions", transactions);
  } catch (err: any) {
    throw new Error(err);
  }
};

const createMasterWallet = async () => {
  try {
    const blockChainInfo = await getBlockChainInfo();

    console.log("blockChainInfo", blockChainInfo);
    const fetchedWallet = await loadWallet("initWallet");
    console.log("fetchedWallet", fetchedWallet);

    //const createTaprootAddy = await createTaprootAddress();

    const listTransactionsRes = await listTransactions({
      account: "*",
      count: 10,
      skip: 0,
      includeWatchOnly: true,
    });
    console.log("listTransactionsRes", listTransactionsRes);
    //console.log("createTaprootAddy", createTaprootAddy);
  } catch (err: any) {
    console.log("err", err);

    throw new Error(err);
  }
};

const startUp2 = async () => {
  try {
    // get currnet blockchain info
    const blockChainInfo = await getBlockChainInfo();
    console.log("blockChainInfo", blockChainInfo);

    const listWalletsRes = await listWallets();
    console.log("listWalletsRes", listWalletsRes);

    const walletName = "sbtcWallet2";
    // const loadLatestWallet = await loadWallet(walletName);

    // console.log("loadLatestWallet", loadLatestWallet);

    const unloadWalletRes = await unloadWallet(walletName);
    console.log("unloadWalletRes", unloadWalletRes);

    throw new Error("stop");
    const getAddressesByLabelres = await getAddressesByLabel("sbtcWallet");

    const getNewAddressByLabelRes = await getNewAddress();
    console.log("getNewAddressByLabelRes", getNewAddressByLabelRes);
    throw new Error("stop");

    if (listWalletsRes && listWalletsRes.length > 1) {
      const walletAddress = await getNewAddressByLabel(walletName);
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

      const createWalletRes = await createWallet(walletName);
      console.log("createWalletRes", createWalletRes);
      // get the new address from the wallet
      const newAddy = await createTaprootAddress(walletName);
    }
  } catch (err: any) {
    console.log("err", err);
    throw new Error(err);
  }
};

const loadedWalletAddress = "bcrt1qgvg8arxt83wyny36g7elnz8mq37rgvwh6d6s52";
const secondWallet = "bcrt1qqtw6azqvurzrrhyrwzlknd5rve4pkgnas3sgc9";

// create a taproot address and send funds to
const createAnotherTapRootAddres = async () => {
  try {
    const walletName = "sbtcWallet";
    const tapRootAddy = await createTaprootAddress(walletName);

    // create a
  } catch (err: any) {
    console.log("err", err);
    throw new Error(err);
  }
};
//startUp();

//startUp2();

const checkLoadedWallets = async () => {
  try {
    const listWalletsRes = await listWallets();
    console.log("listWalletsRes", listWalletsRes);
  } catch (err: any) {
    throw new Error(err);
  }
};

const generateToAddressForLoadedWallet = async () => {
  try {
    await checkLoadedWallets();
    const walletAddress = await getNewAddress();
    console.log("walletAddress", walletAddress);
  } catch (err: any) {
    throw new Error(err);
  }
};

//checkLoadedWallets();

//generateToAddressForLoadedWallet();

const listUnspentFromAddress = async (address: string) => {
  try {
    const listUnspentres = await listUnspent({
      minconf: 0,
      maxconf: 9999999,
      addresses: [address],
    });

    console.log("listUnspentres", listUnspentres);
  } catch (err: any) {
    throw new Error(err);
  }
};

const listUnspentFromOurWallets = async () => {
  try {
    await listUnspentFromAddress(loadedWalletAddress);
    await listUnspentFromAddress(secondWallet);
  } catch (err: any) {
    throw new Error(err);
  }
};

//listUnspentFromOurWallets();

const txId = "a9a3e5d43a0777f28556ed5a0af4f2c43e4502cc8b8bd18778ae5beb80b6f3e6";

//mineAndCheckId();

//sendFundsTest();

//listUnspentFromOurWallets();

// Function to get all UTXOs for a given address and sum the total balance
const getTotalBalanceForAddress = async (address: string): Promise<number> => {
  try {
    // Step 1: List unspent UTXOs for the address

    const utxos = await listUnspent({
      minconf: 0,
      maxconf: 9999999,
      addresses: [address],
    });

    if (!utxos || utxos.length === 0) {
      throw new Error(`No UTXOs found for address ${address}`);
    }

    // Step 2: Sum the amounts of all UTXOs
    let totalBalance = 0;
    for (const utxo of utxos) {
      totalBalance += utxo.amount; // Add up the amount from each UTXO
    }

    console.log(`Total Balance for ${address}: ${totalBalance} BTC`);
    return totalBalance; // Return the total balance
  } catch (err: any) {
    console.error("Error calculating total balance:", err);
    throw new Error(err);
  }
};

//getTotalBalanceForAddress(loadedWalletAddress);
//getTotalBalanceForAddress(secondWallet);

const sendTaprootTransactionWithScripts = async () => {
  //const senderPrivKeyWIF = 'your-private-key-wif';

  const blockChainInfo = await getBlockChainInfo();
  console.log("blockChainInfo", blockChainInfo);

  const listWalletsRes = await listWallets();
  console.log("listWalletsRes", listWalletsRes);

  //const loadWalletRes = await loadWallet("sbtcWallet");
  //console.log("loadWalletRes", loadWalletRes);

  const listAddressGroupingsRes = await listAddressGroupings();

  console.log("listAddressGroupingsRes", listAddressGroupingsRes);

  const getWalletInfoRes = await getWalletInfo();
  console.log("getWalletInfoRes", getWalletInfoRes);

  const getAddressInfoRes = await getAddressInfo(
    "bcrt1qqtw6azqvurzrrhyrwzlknd5rve4pkgnas3sgc9"
  );
  console.log("getAddressInfoRes", getAddressInfoRes);

  const dumpPrivKeyRes = await dumpPrivKey(
    "bcrt1qqtw6azqvurzrrhyrwzlknd5rve4pkgnas3sgc9"
  );

  console.log("dumpPrivKeyRes", dumpPrivKeyRes);
  throw new Error("stop");

  const receiverAddress = secondWallet;
  const signersPublicKey = Buffer.from("your-signer-public-key", "hex"); // Signer's public key
  const amount = 1000000; // 0.01 BTC
  const maxFee = 1000; // Transaction fee
  const lockTime = 50; // Example lock time for CSV

  try {
    // Create and sign the Taproot transaction with deposit and reclaim scripts
    /*
    const txHex = await createAndSignTaprootTransactionWithScripts(
      senderPrivKeyWIF,
      receiverAddress,
      amount,
      signersPublicKey,
      maxFee,
      lockTime
    );

    // Broadcast the transaction
    await broadcastTransaction(txHex);
    */
  } catch (error) {
    console.error("Error sending transaction:", error);
  }
};

//sendTaprootTransactionWithScripts();

// Full flow of creating wallet and dumping private key
export const createWalletAndExportPrivKeys = async () => {
  try {
    // Step 1: Create a new wallet
    const walletName = "sbtcWallet";

    const listWalletsRes = await listWallets();
    console.log("listWalletsRes", listWalletsRes);

    //const createWalletRes = await createDescriptorWallet(walletName);
    //console.log("createWalletRes", createWalletRes);
    const address = "bcrt1qvkvtachn74jukkzea86phk5aq59mtfks9zz4m9";
    // Step 2: Generate a new address
    /*
    const newAddress = await getNewAddressByLabel(walletName);
    console.log("newAddress", newAddress);
      // Step 3: Dump the private key for the generated address
    const privateKey = await dumpPrivKey(newAddress);
    console.log("Private Key:", privateKey);
    */

    const getWalletDescriptorRes = await getWalletDescriptor();
    console.log("getWalletDescriptorRes", getWalletDescriptorRes);

    const addressInfo = await getAddressInfo(address);
    console.log("Address Info:", addressInfo);

    const privateKey = await dumpPrivKey(address);
    console.log("Private Key:", privateKey);
  } catch (err: any) {
    console.error("Error during wallet creation and private key export:", err);
    throw new Error(err);
  }
};

//createWalletAndExportPrivKeys();

export const DEPOSIT_SEED_PHRASE = "DEPOSIT_SEED_PHRASE";
export const SIGNER_SEED_PHRASE = "SIGNER_SEED_PHRASE";
export const RECEIVER_SEED_PHRASE = "RECEIVER_SEED_PHRASE";
const createPTRAddress = async () => {
  try {
    const privateKey = getPrivateKeysFromSeed(DEPOSIT_SEED_PHRASE);

    const signerInfo = getP2TR(SIGNER_SEED_PHRASE);
    console.log("signerInfo", signerInfo);

    const p2wsh = getP2WSH(DEPOSIT_SEED_PHRASE);
    console.log("p2wsh", p2wsh.pubkey);
    //throw new Error("stop");
    const p2wshPrivateKeys = getPrivateKeysFromSeed(DEPOSIT_SEED_PHRASE);

    console.log("testTing", p2wsh.address);
    console.log("p2wshPrivateKeys", p2wshPrivateKeys);

    const signersPublicKey = createUnspendableTaprootKey();
    const signersPublicKeyHex = uint8ArrayToHexString(signersPublicKey);

    console.log("signersPublicKeyHex", signersPublicKeyHex);
    console.log("signersPublicKey", signersPublicKey);

    const hexSingerPubKey = uint8ArrayToHexString(signersPublicKey);
    console.log("hexSingerPubKey", hexSingerPubKey);

    const network: BitcoinNetwork = "regtest";

    const senderPrivKeyWIF = privateKeyToWIF(privateKey, network);
    // stx
    const receiverAddress = "051aaf3f91f38aa21ade7e9f95efdbc4201eeb4cf0f8";
    const amount = 10000000;
    const maxFee = 10000;
    const lockTime = 25;

    // Create and sign the Taproot transaction with deposit and reclaim scripts
    const txHex = await createDepositScriptP2TROutput(
      senderPrivKeyWIF,
      receiverAddress || "",
      amount,
      signerInfo.pubkey || ([] as any),
      maxFee,
      lockTime,
      p2wsh.address || "",
      signerInfo.address || ""
    );

    console.log("txHex", txHex);
    // Broadcast the transaction
    const decodedTx = await decodeRawTransaction(txHex);
    console.log("decodedTx", decodedTx);
    //console.log("jig", JSON.stringify(decodedTx, null, 2));
    const testTx = await testMempoolAccept(txHex);
    console.log("testTx", testTx);
    throw new Error("stop");

    const id = await sendRawTransaction(txHex);
    console.log("id", id);

    const mineAndCheck = await mineAndCheckId(id);
    console.log("mineAndCheck", mineAndCheck);
  } catch (err: any) {
    console.error("Error creating PTR address:", err);
    throw new Error(err);
  }
};

createPTRAddress();

//startUp();

//sendFundsTest();

const txIdTing =
  "cf9e66c5a154cb39ba18005181488de7924b92cca6f39437e99384a1bdacd23e";

//mineAndCheckId(txIdTing);

//scanTxOutSetHelper();

//createP2trAddy(SIGNER_SEED_PHRASE);

//checkTxStatusHelper(txIdTing);
//importAddressHelper();
