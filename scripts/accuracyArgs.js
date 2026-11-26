export function parseArgs(argv) {
  const args = {
    dryRun: false,
    begin: null,
    end: null,
    resort: null,
    outDir: "output/accuracy",
    forecast: null,
    observations: null,
    now: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") args.dryRun = true;
    else if (token === "--begin") args.begin = argv[++i];
    else if (token === "--end") args.end = argv[++i];
    else if (token === "--resort") args.resort = argv[++i];
    else if (token === "--out") args.outDir = argv[++i];
    else if (token === "--forecast") args.forecast = argv[++i];
    else if (token === "--observations") args.observations = argv[++i];
    else if (token === "--now") args.now = argv[++i];
    else if (token === "--help") args.help = true;
    else throw new Error(`Unknown argument ${token}`);
  }
  if ((args.begin && !args.end) || (!args.begin && args.end)) {
    throw new Error("Pass both --begin and --end (YYYY-MM-DD), or neither");
  }
  for (const value of [args.begin, args.end]) {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`Expected YYYY-MM-DD, got ${value}`);
    }
  }
  return args;
}

export function resolveNow(args) {
  if (!args.now) return new Date();
  const now = new Date(args.now);
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now ${args.now}`);
  return now;
}
