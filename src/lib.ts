import { crypto, networks, payments } from "bitcoinjs-lib";
import { HDKey } from "@scure/bip32";
import {
  generateToAddress,
  getBlockChainInfo,
  listUnspent,
} from "./rpcCommands";
import { getP2pkh } from "./wallet";

const startUpFaucet = async () => {
  try {
    // ensure the bitcoind is up and running by checking the chaintip
    const blockChainInfo = await getBlockChainInfo();

    console.log("blockChainInfo", blockChainInfo);
    // assuming it didn't err out then we can prooced

    // create a faucet wallet
    const wallet = getP2pkh("faucet");

    if (!wallet) throw new Error("no wallet");

    console.log("wallet", wallet);

    /*
    // send some coins to the faucet wallet
    const sendToAddress = await generateToAddress({
      address: wallet,
      nblocks: 101,
    });
    */

    // in order to check how much the faucet have we have to get all the unspent utxos for this from block to  to block

    // refetch the blockchain info
    const blockChainInfo2 = await getBlockChainInfo();

    const listunspent = await listUnspent({
      minconf: 0,
      maxconf: 9999999,
      addresses: [wallet],
    });

    console.log("listunspent", listunspent);
    //console.log("sendToAddress", sendToAddress);
  } catch (err: any) {
    throw new Error(err);
  }
};

startUpFaucet();
