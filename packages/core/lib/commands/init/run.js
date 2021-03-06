module.exports = async function (options) {
  const { copyFiles } = require("./copyFiles");
  const fse = require("fs-extra");
  const Config = require("@truffle/config");
  const config = Config.default();

  let destinationPath;
  if (options._ && options._.length > 0) {
    destinationPath = options._[0];
    fse.ensureDirSync(destinationPath);
  } else {
    destinationPath = config.working_directory;
  }

  const { events } = config;
  events.emit("init:start");

  try {
    await copyFiles(destinationPath, config);
    await events.emit("init:succeed");
  } catch (error) {
    await events.emit("init:fail", { error });
    throw error;
  }
  return;
};
