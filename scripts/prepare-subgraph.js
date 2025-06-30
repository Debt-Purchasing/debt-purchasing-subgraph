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

  // Replace network placeholders (both formats)
  template = template.replace(/\{\{\s*network\s*\}\}/g, network);
  template = template.replace(/\{\s*\{\s*network\s*\}\s*\}/g, network);

  // Replace contract addresses and start blocks
  Object.keys(networkConfig).forEach((contractName) => {
    if (
      typeof networkConfig[contractName] === "object" &&
      networkConfig[contractName].address
    ) {
      // Handle both {{ }} and { { } } formats
      const addressPattern1 = new RegExp(
        `\\{\\{\\s*${contractName}\\.address\\s*\\}\\}`,
        "g"
      );
      const addressPattern2 = new RegExp(
        `\\{\\s*\\{\\s*${contractName}\\.address\\s*\\}\\s*\\}`,
        "g"
      );
      const startBlockPattern1 = new RegExp(
        `\\{\\{\\s*${contractName}\\.startBlock\\s*\\}\\}`,
        "g"
      );
      const startBlockPattern2 = new RegExp(
        `\\{\\s*\\{\\s*${contractName}\\.startBlock\\s*\\}\\s*\\}`,
        "g"
      );

      template = template.replace(
        addressPattern1,
        networkConfig[contractName].address
      );
      template = template.replace(
        addressPattern2,
        networkConfig[contractName].address
      );
      template = template.replace(
        startBlockPattern1,
        networkConfig[contractName].startBlock
      );
      template = template.replace(
        startBlockPattern2,
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

  // Verify the template was processed correctly
  const generatedContent = fs.readFileSync(outputPath, "utf8");
  if (generatedContent.includes("{{") || generatedContent.includes("{ {")) {
    console.warn("⚠️  Warning: Some template placeholders were not replaced");
    const remainingPlaceholders = generatedContent.match(
      /\{\s*\{[^}]+\}\s*\}/g
    );
    if (remainingPlaceholders) {
      console.warn("Remaining placeholders:", remainingPlaceholders);
    }
  } else {
    console.log("✅ All template placeholders were successfully replaced");
  }
}

// Get network from command line arguments
const network = process.argv[2] || "sepolia";
prepareSubgraph(network);
