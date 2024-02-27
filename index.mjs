import fetch from "node-fetch";
import fs from "fs";
import { ethers, FixedNumber } from "ethers";

const GRAPHQL_URL = "https://api.thegraph.com/subgraphs/name/paraswap/paraswap-subgraph";

const chains = ["bsc"]//["eth", "polygon", "arbitrum", "optimism", "avalanche", "bsc"];
const gecko_chains = ["bsc"]//["eth", "polygon_pos", "arbitrum", "optimism", "avax", "bsc"];

function coingeckoUrl(chainIndex, token) {
  let chain = gecko_chains[chainIndex];
  return `https://api.geckoterminal.com/api/v2/networks/${chain}/tokens/${token}`;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function queryPartnerFees(chain) {
  // Construct a schema, using GraphQL schema language
  const querySchema = `
    {
      partnerFees(first: 100, where: {partnerAddress: "0x9abf798f5314bfd793a9e57a654bed35af4a1d60"}, orderBy:"totalRewards", orderDirection: desc) {
        tokenAddress
        totalRewards
      }
    }
  `;
  let url = (chain === "eth") ? GRAPHQL_URL : GRAPHQL_URL + "-" + chain;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: querySchema,
    }),
  });

  const responseBody = await response.json();
  return responseBody.data.partnerFees;
}


async function queryTokenInfo(chainIndex, tokenAddress) {
  let url = coingeckoUrl(chainIndex, tokenAddress);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "accept": "application/json",
    }
  });
  const responseBody = await response.json();
  return responseBody.data.attributes;
}


async function fetchAllChains() {
  let chainFees = [];
  for (let i = 0; i < chains.length; i++) {
    const newFees = await queryPartnerFees(chains[i]);
    chainFees[i] = newFees;
    console.log(`${chains[i]}: ${newFees.length} tokens have unclaimed fees`);
  }
  return chainFees;
}


async function data() {
  let fullData = [];
  let chainFees = await fetchAllChains();
  stream.write("[\n");
  for (let i = 0; i < chains.length; i++) {
    for (let j = 0; j < chainFees[i].length; j++) {
      let tokenInfo = await queryTokenInfo(i, chainFees[i][j].tokenAddress);

      let paraswap_fees = (chainFees[i][j].totalRewards && tokenInfo["decimals"]) ? FixedNumber.fromValue(chainFees[i][j].totalRewards, tokenInfo["decimals"]).toString() : "NULL";
      let paraswap_fees_USD = (chainFees[i][j].totalRewards && tokenInfo["price_usd"] && tokenInfo["decimals"]) ? FixedNumber.fromValue(chainFees[i][j].totalRewards, tokenInfo["decimals"]).mul(FixedNumber.fromString(tokenInfo["price_usd"])).toString() : "0";

      let tokenData = {};
      tokenData["chain"] = chains[i];
      tokenData = {
        chain: chains[i],
        ...tokenInfo,
        paraswap_fees: paraswap_fees,
        paraswap_fees_USD: paraswap_fees_USD
      }
      await sleep(2200);

      fullData.push(tokenData);

      let text = JSON.stringify({
        ...tokenData,
      });
      if (i === chains.length && j === chainFees[i].length)
        stream.write(text);
      else
        stream.write(text + ",\n");
    }
  }
  stream.write("\n]");
  return fullData;
}

let stream = fs.createWriteStream("paraswap-fees.json", { flags: "a" });

async function handleUserData(text) {
  stream.write(text, function (error) { });
}

fs.truncate("paraswap-fees.json", 0, function () {
  console.log("cleared-file");
});

data();