// Preloaded only into the Vercel CLI process (via NODE_OPTIONS). The machine's
// hostname contains non-ASCII characters, which the CLI puts into an HTTP header
// and crashes on ("Cannot convert argument to a ByteString"). The system
// hostname itself is not changed.
const os = require("node:os");
const original = os.hostname;
os.hostname = () => {
  const name = original.call(os);
  return /^[\x00-\x7f]*$/.test(name) ? name : "zhihu-hackathon-dev";
};
