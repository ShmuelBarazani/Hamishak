10:59:11.807 Running build in Portland, USA (West) – pdx1
10:59:11.808 Build machine configuration: 2 cores, 8 GB
10:59:11.936 Cloning github.com/ShmuelBarazani/Hamishak (Branch: main, Commit: 8732cfa)
10:59:12.498 Cloning completed: 561.000ms
10:59:12.649 Restored build cache from previous deployment (GGUC8dAt2DGCiT9HRt2G62JzFTBf)
10:59:12.931 Running "vercel build"
10:59:13.588 Vercel CLI 50.32.4
10:59:14.254 Installing dependencies...
10:59:17.526 
10:59:17.527 up to date in 3s
10:59:17.527 
10:59:17.527 135 packages are looking for funding
10:59:17.528   run `npm fund` for details
10:59:17.564 Running "npm run build"
10:59:18.349 
10:59:18.349 > hamishak-hamadhhim@1.0.0 build
10:59:18.350 > vite build
10:59:18.350 
10:59:18.823 [36mvite v6.4.1 [32mbuilding for production...[36m[39m
10:59:18.890 transforming...
10:59:20.979 [32m✓[39m 44 modules transformed.
10:59:21.005 [31m✗[39m Build failed in 2.15s
10:59:21.005 [31merror during build:
10:59:21.008 [31m[vite:esbuild] Transform failed with 1 error:
10:59:21.009 /vercel/path0/src/pages/LeaderboardNew.jsx:16:7: ERROR: Unexpected "React"[31m
10:59:21.009 file: [36m/vercel/path0/src/pages/LeaderboardNew.jsx:16:7[31m
10:59:21.009 [33m
10:59:21.009 [33mUnexpected "React"[33m
10:59:21.009 14 |    const [rankings, setRankings] = useState([]);
10:59:21.009 15 |    const [loading, setLoading] = useState(true);
10:59:21.010 16 |  import React, { useState, useEffect, useCallback } from "react";
10:59:21.010    |         ^
10:59:21.010 17 |  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
10:59:21.010 18 |  import { Badge } from "@/components/ui/badge";
10:59:21.010 [31m
10:59:21.010     at failureErrorWithLog (/vercel/path0/node_modules/esbuild/lib/main.js:1467:15)
10:59:21.010     at /vercel/path0/node_modules/esbuild/lib/main.js:736:50
10:59:21.011     at responseCallbacks.<computed> (/vercel/path0/node_modules/esbuild/lib/main.js:603:9)
10:59:21.011     at handleIncomingPacket (/vercel/path0/node_modules/esbuild/lib/main.js:658:12)
10:59:21.011     at Socket.readFromStdout (/vercel/path0/node_modules/esbuild/lib/main.js:581:7)
10:59:21.011     at Socket.emit (node:events:508:28)
10:59:21.011     at addChunk (node:internal/streams/readable:559:12)
10:59:21.012     at readableAddChunkPushByteMode (node:internal/streams/readable:510:3)
10:59:21.012     at Readable.push (node:internal/streams/readable:390:5)
10:59:21.012     at Pipe.onStreamRead (node:internal/stream_base_commons:189:23)[39m
10:59:21.076 Error: Command "npm run build" exited with 1
