#!/usr/bin/env node
/**
 * Deploys contracts/SoulRegistry.sol to Polygon.
 *
 * Run this yourself, in your own terminal — your private key never leaves
 * your machine and is never sent to or seen by anyone else.
 *
 * Usage (run from the repo root, after `npm install` — ethers is already
 * a project dependency; solc is fetched on demand via `npx solc`):
 *   PRIVATE_KEY=0x... node contracts/deploy.mjs                # Polygon Mainnet
 *   PRIVATE_KEY=0x... NETWORK=amoy node contracts/deploy.mjs   # Amoy Testnet (free, for testing)
 */
import { ethers } from 'ethers';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = join(__dirname, 'SoulRegistry.sol');

const NETWORKS = {
  main: {
    name: 'Polygon Mainnet',
    chainId: 137,
    rpc: 'https://polygon-bor-rpc.publicnode.com',
    explorer: 'https://polygonscan.com',
  },
  amoy: {
    name: 'Polygon Amoy Testnet',
    chainId: 80002,
    rpc: 'https://rpc-amoy.polygon.technology',
    explorer: 'https://amoy.polygonscan.com',
  },
};

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: PRIVATE_KEY env var not set.');
    console.error('Usage: PRIVATE_KEY=0x... node contracts/deploy.mjs');
    process.exit(1);
  }

  const netKey = process.env.NETWORK === 'amoy' ? 'amoy' : 'main';
  const net = NETWORKS[netKey];

  console.log('── Compiling SoulRegistry.sol ──────────────────────────────');
  const source = readFileSync(CONTRACT_PATH, 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'SoulRegistry.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  let compilerVersion = '';
  try {
    compilerVersion = execFileSync('npx', ['--yes', 'solc', '--version'], { encoding: 'utf8' }).trim();
  } catch { /* non-fatal */ }

  const raw = execFileSync('npx', ['--yes', 'solc', '--standard-json'], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });
  // solc-js sometimes prints a warning line before the JSON (e.g. missing SMT solvers) — skip to the first "{"
  const jsonStart = raw.indexOf('{');
  const output = JSON.parse(raw.slice(jsonStart));

  const errors = (output.errors || []).filter(e => e.severity === 'error');
  if (errors.length) {
    console.error('Compilation failed:');
    for (const e of errors) console.error(e.formattedMessage);
    process.exit(1);
  }
  for (const w of (output.errors || [])) console.warn(w.formattedMessage);

  const contract = output.contracts['SoulRegistry.sol'].SoulRegistry;
  const abi = contract.abi;
  const bytecode = '0x' + contract.evm.bytecode.object;
  console.log(`Compiled OK — bytecode ${bytecode.length / 2 - 1} bytes.`);
  console.log(`Compiler version: ${compilerVersion || '(see npx solc --version above)'}`);
  console.log('Optimizer: enabled, 200 runs — note these exact settings, you need them for Polygonscan verification.');

  console.log('\n── Connecting ───────────────────────────────────────────────');
  const provider = new ethers.JsonRpcProvider(net.rpc);
  const wallet = new ethers.Wallet(privateKey, provider);
  const balance = await provider.getBalance(wallet.address);

  console.log(`Network:  ${net.name} (chainId ${net.chainId})`);
  console.log(`Deployer: ${wallet.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} POL`);

  if (balance === 0n) {
    console.error('\nError: deployer wallet has 0 POL. Fund it first (gas required for deployment).');
    process.exit(1);
  }

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const deployTx = await factory.getDeployTransaction();
  const gasEstimate = await provider.estimateGas({ ...deployTx, from: wallet.address });
  const feeData = await provider.getFeeData();
  const estCost = gasEstimate * (feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n);

  console.log(`\nEstimated gas: ${gasEstimate.toString()} units (~${ethers.formatEther(estCost)} POL)`);

  const confirm = await ask(`\nDeploy SoulRegistry v1.1.0 to ${net.name}? This is a real, irreversible transaction. Type "yes" to proceed: `);
  if (confirm.trim().toLowerCase() !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }

  console.log('\n── Deploying ────────────────────────────────────────────────');
  const soulRegistry = await factory.deploy();
  console.log(`Transaction sent: ${soulRegistry.deploymentTransaction().hash}`);
  console.log('Waiting for confirmation...');
  await soulRegistry.waitForDeployment();

  const address = await soulRegistry.getAddress();
  console.log('\n── Deployed ─────────────────────────────────────────────────');
  console.log(`Address:  ${address}`);
  console.log(`Explorer: ${net.explorer}/address/${address}`);
  console.log(`\nNext: verify on Polygonscan using the exact compiler version + optimizer settings printed above.`);
  console.log(`Then send me the new address — I'll update the 4 hardcoded code locations + docs.`);
}

main().catch((err) => {
  console.error('\nDeploy failed:', err.message ?? err);
  process.exit(1);
});
