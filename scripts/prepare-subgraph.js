const fs = require("fs");
const path = require("path");

function prepareSubgraph(network) {
  console.log(`Preparing subgraph for network: ${network}`);

  // Read networks configuration
  const networksPath = path.join(__dirname, "../networks.json");
  const networks = JSON.parse(fs.readFileSync(networksPath, "utf8"));

  if (!networks[network]) {
    throw new Error(`Network ${network} not found in networks.json`);
  }

  const networkConfig = networks[network];

  // Read template
  const templatePath = path.join(__dirname, "../subgraph.template.yaml");
  let template = fs.readFileSync(templatePath, "utf8");

  // Replace network
  template = template.replace(/\{\{network\}\}/g, network);

  // Replace contract addresses and start blocks
  Object.keys(networkConfig).forEach((contractName) => {
    if (
      typeof networkConfig[contractName] === "object" &&
      networkConfig[contractName].address
    ) {
      const addressPattern = new RegExp(
        `\\{\\{${contractName}\\.address\\}\\}`,
        "g"
      );
      const startBlockPattern = new RegExp(
        `\\{\\{${contractName}\\.startBlock\\}\\}`,
        "g"
      );

      template = template.replace(
        addressPattern,
        networkConfig[contractName].address
      );
      template = template.replace(
        startBlockPattern,
        networkConfig[contractName].startBlock
      );
    }
  });

  // Write subgraph.yaml
  const outputPath = path.join(__dirname, "../subgraph.yaml");
  fs.writeFileSync(outputPath, template);

  console.log(`✅ Generated subgraph.yaml for ${network} network`);
  console.log(`📝 Contract addresses:`);
  Object.keys(networkConfig).forEach((contractName) => {
    if (
      typeof networkConfig[contractName] === "object" &&
      networkConfig[contractName].address
    ) {
      console.log(`   ${contractName}: ${networkConfig[contractName].address}`);
    }
  });
}

// Get network from command line arguments
const network = process.argv[2] || "sepolia";
prepareSubgraph(network);
