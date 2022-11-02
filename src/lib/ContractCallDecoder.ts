import radspec from '@blossom-labs/rosette-radspec';
import { Interface } from '@ethersproject/abi';
import {
  decode as decodeBytecode,
  get as getBytecode,
} from '@marcocastignoli/bytecode-utils';
import { EthereumProvider } from 'ethereum-provider';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require('axios');

export enum MetadataSources {
  Sourcify,
  BytecodeMetadata,
}

type GetMetadataOptions = {
  readonly source?: MetadataSources;
  readonly chainId?: number;
  readonly address?: string;
  readonly rpcProvider?: EthereumProvider;
  readonly ipfsProvider?: string;
  readonly sourcifyProvider?: string;
};

const defaultGetMetadataOptions: GetMetadataOptions = {
  source: MetadataSources.Sourcify,
  sourcifyProvider: 'https://repo.sourcify.dev',
  ipfsProvider: 'https://cloudflare-ipfs.com/',
};

export async function getMetadataFromAddress(options: GetMetadataOptions) {
  options = { ...defaultGetMetadataOptions, ...options };
  // eslint-disable-next-line functional/no-let
  let contractMetadataJSON;
  if (options.source === MetadataSources.Sourcify) {
    try {
      const req = await axios.get(
        `${options.sourcifyProvider}/contracts/full_match/${options.chainId}/${options.address}/metadata.json`
      );
      contractMetadataJSON = req.data;
    } catch (e) {
      console.log(e);
      return false;
    }
  } else if (options.source === MetadataSources.BytecodeMetadata) {
    const bytecode = await getBytecode(options.address, options.rpcProvider);
    const { ipfs: metadataIpfsCid } = decodeBytecode(bytecode);
    try {
      const req = await axios.get(
        `${options.ipfsProvider}/ipfs/${metadataIpfsCid}`
      );
      contractMetadataJSON = req.data;
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  return contractMetadataJSON;
}

export const evaluate = async function name(
  expression,
  abi,
  transaction,
  provider?
): Promise<string> {
  return await radspec(expression, abi, transaction, provider);
};

export const findSelectorAndAbiItemFromSignatureHash = (
  functionSignatureHash,
  abi
) => {
  const interf = new Interface(abi);
  const selector = Object.keys(interf.functions).find((selector) => {
    return interf.getSighash(selector) === functionSignatureHash;
  });
  // TODO: handle error
  return {
    selector,
    abi: interf.functions[selector],
  };
};

export const evaluateCallDataFromTx = async (
  tx,
  options: GetMetadataOptions = {}
): Promise<string> => {
  const getMetadataOptions = {
    ...defaultGetMetadataOptions,
    ...options,
    address: tx.to,
    chainId: tx.chainId,
  };
  const metadata = await getMetadataFromAddress(getMetadataOptions);

  const functionSignatureHash = tx.data.slice(0, 10);

  const { selector } = findSelectorAndAbiItemFromSignatureHash(
    functionSignatureHash,
    metadata.output.abi
  );

  const evaluatedString = await evaluate(
    metadata.output.userdoc.methods[selector].notice,
    metadata.output.abi,
    tx,
    getMetadataOptions.rpcProvider
  );
  return evaluatedString;
};
