const parseCommandLineFlags = options => {
  // parse out command line flags to merge in to the config
  const grep = options.grep || options.g;
  const bail = options.bail || options.b;
  const reporter = options.reporter || options.r;

  /**
   * This if-else condition is explicitly written to avoid the overlapping of
   * the config by the default mocha reporter type when user specifies a mocha reporter type
   * in the config and doesn't specify it as the command line argument.
   * If the reporter is returned as undefined, it ignores the specification of any reporter type in the
   * config and displays the default mocha reporter "spec", as opposed to reporter completely being absent
   * which results in checking for the reporter type specified in the config.
   */
  if (reporter === undefined) {
    return {
      mocha: {
        grep,
        bail
      }
    };
  } else {
    return {
      mocha: {
        grep,
        bail,
        reporter
      }
    };
  }
};

module.exports = async function (options) {
  const Config = require("@truffle/config");
  const { Environment, Develop } = require("@truffle/environment");
  const { copyArtifactsToTempDir } = require("./copyArtifactsToTempDir");
  const { determineTestFilesToRun } = require("./determineTestFilesToRun");
  const { prepareConfigAndRunTests } = require("./prepareConfigAndRunTests");

  const optionsToMerge = parseCommandLineFlags(options);
  const config = Config.detect(options).merge(optionsToMerge);

  // if "development" exists, default to using that for testing
  if (!config.network && config.networks.development) {
    config.network = "development";
  }

  if (!config.network) {
    config.network = "test";
  } else {
    await Environment.detect(config);
  }

  // Start managed ganache network
  async function startGanacheAndRunTests(ipcOptions, ganacheOptions, config) {
    const { disconnect } = await Develop.connectOrStart(
      ipcOptions,
      ganacheOptions
    );
    const ipcDisconnect = disconnect;
    await Environment.develop(config, ganacheOptions);
    const { temporaryDirectory } = await copyArtifactsToTempDir(config);
    const numberOfFailures = await prepareConfigAndRunTests({
      config,
      files,
      temporaryDirectory
    });
    ipcDisconnect();
    return numberOfFailures;
  }

  if (config.stacktraceExtra) {
    config.stacktrace = true;
    config.compileAllDebug = true;
  }
  // enables in-test debug() interrupt, or stacktraces, forcing compileAll
  if (config.debug || config.stacktrace || config.compileAllDebug) {
    config.compileAll = true;
  }

  const { file } = options;
  const inputArgs = options._;
  const files = determineTestFilesToRun({
    config,
    inputArgs,
    inputFile: file
  });

  const configuredNetwork = config.networks[config.network];
  const testNetworkDefinedAndUsed =
    configuredNetwork && config.network === "test";
  const noProviderHostOrUrlConfigured =
    configuredNetwork &&
    !configuredNetwork.provider &&
    !configuredNetwork.host &&
    !configuredNetwork.url;
  const ipcOptions = { network: "test" };
  let numberOfFailures;
  let ganacheOptions = {
    host: "127.0.0.1",
    network_id: 4447,
    mnemonic:
      "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat",
    time: config.genesis_time,
    miner: {
      instamine: "strict"
    }
  };

  if (
    (testNetworkDefinedAndUsed && noProviderHostOrUrlConfigured) ||
    !configuredNetwork
  ) {
    // Use managed ganache with overriding user specified config or without any specification in the config
    const port = await require("get-port")();

    // configuredNetwork will spread only when it is defined and ignored when undefined
    ganacheOptions = { ...ganacheOptions, port, ...configuredNetwork };
    numberOfFailures = await startGanacheAndRunTests(
      ipcOptions,
      ganacheOptions,
      config
    );
  } else {
    // Use unmanaged network with user specified config if provider, host or url exists
    await Environment.detect(config);
    const { temporaryDirectory } = await copyArtifactsToTempDir(config);
    numberOfFailures = await prepareConfigAndRunTests({
      config,
      files,
      temporaryDirectory
    });
  }
  return numberOfFailures;
};
