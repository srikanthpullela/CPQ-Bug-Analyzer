// File: src/utils/log-parser.ts

export interface LogEntry {
  pod: string; // filename passed in from the uploader
  raw: string; // entire block of lines (joined with "\n")
  timestamp?: string; // e.g. "05/27/2025 14:44:20.454Z" (if available)
  logLevel?: string; // "ERROR"
  threadId?: string; // e.g. "0061" or undefined if no thread was found
  cartIds: string[]; // (not used in this example, but left here for compatibility)
  isError: boolean; // true iff the header line contained "[ERROR]"
  isException: boolean; // true iff the header line was recognized as a standalone .NET exception
  lines: string[]; // the block of lines we collected around the header
}

const THREAD_REGEX = /\[Thread\s+(\d+)\]/; // matches "[Thread 0044]"
const ERROR_REGEX = /^\[ERROR\]/; // matches lines starting with "[ERROR]"
const EXCEPTION_REGEX = /^\s*(?:\w+\.)*\w+Exception:/; // must start with "Something.Exception:"
const MAX_PREV_LINES = 50;
const MAX_NEXT_LINES = 50;
const MAX_ENTRIES = 1000;

export function parseLogFile(fileContent: string, pod: string): LogEntry[] {
  const lines = fileContent.split(/\r?\n/);
  const entries = [] as LogEntry[];
  const totalLines = lines.length;

  for (let idx = 0; idx < totalLines && entries.length < MAX_ENTRIES; idx++) {
    const line = lines[idx];

    // ——— 1) Standalone .NET exception (no [Thread …]) ———
    //    If a line literally begins with "Something.Exception:" (e.g. "System.Net.Http.HttpRequestException: …")
    //    and it does NOT contain any "[Thread …]", treat that as the header immediately.
    if (EXCEPTION_REGEX.test(line) && !THREAD_REGEX.test(line)) {
      // Use this line (e.g. "System.SomeException: ...") as the header.
      const headerLine = line;

      // 1a) Collect up to MAX_PREV_LINES immediately before, regardless of thread.
      const collectedPrev: string[] = [];
      for (
        let j = idx - 1, cnt = 0;
        j >= 0 && cnt < MAX_PREV_LINES;
        j--, cnt++
      ) {
        collectedPrev.unshift(lines[j]);
      }

      // 1b) Collect up to MAX_NEXT_LINES immediately after.
      const collectedNext: string[] = [];
      for (
        let j = idx + 1, cnt = 0;
        j < totalLines && cnt < MAX_NEXT_LINES;
        j++, cnt++
      ) {
        collectedNext.push(lines[j]);
      }

      const fullBlock = [...collectedPrev, headerLine, ...collectedNext];
      entries.push({
        pod,
        raw: fullBlock.join("\n"),
        timestamp: undefined,
        logLevel: undefined,
        threadId: "unknown",
        cartIds: [],
        isError: false,
        isException: true,
        lines: fullBlock,
      });

      continue; // move on to next line after pushing this block
    }

    // ——— 2) ERROR + Thread + Exception case ———
    //    If a line starts with "[ERROR]" AND contains "[Thread …]" AND mentions "Exception" anywhere,
    //    treat it as a combined ERROR+THREAD block.
    if (
      ERROR_REGEX.test(line) &&
      THREAD_REGEX.test(line) &&
      /Exception/.test(line)
    ) {
      const threadMatch = line.match(THREAD_REGEX);
      const threadId = threadMatch ? threadMatch[1] : undefined;

      // 2a) Collect up to MAX_PREV_LINES from the same thread
      const collected: string[] = [];
      collected.unshift(line); // header = this "[ERROR]…Exception…" line

      let count = 0;
      for (let j = idx - 1; j >= 0 && count < MAX_PREV_LINES; j--) {
        if (lines[j].includes(`[Thread ${threadId}]`)) {
          collected.unshift(lines[j]);
          count++;
        }
      }

      // 2b) Extract timestamp if present in "[ERROR][MM/DD/YYYY hh:mm:ss.sssZ]"
      let timestamp: string | undefined;
      const tsMatch = line.match(
        /^\[ERROR\]\[(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/
      );
      if (tsMatch) {
        timestamp = tsMatch[1];
      }

      entries.push({
        pod,
        raw: collected.join("\n"),
        timestamp,
        logLevel: "ERROR",
        threadId,
        cartIds: [],
        isError: true,
        isException: false,
        lines: collected,
      });

      continue; // move on
    }

    // ——— 3) Any other "[ERROR]" lines that do NOT contain "Exception" or "[Thread]" are skipped ———
    // (We do NOT want "[Docker-Bootstrap] SEEDS=[]" or "[INFO]" lines as headers.)

    // ——— 4) Otherwise skip ———
  }

  return entries;
}
