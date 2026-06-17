import * as path from "path";
import * as vscode from "vscode";
import { extractMarkdownHeadings, type ReportHeading } from "./markdownHeadings";

export type ReportFile = {
  name: string;
  label: string;
  uri: string;
  content: string;
  headings: ReportHeading[];
};

export type ReportPayload = {
  ok: true;
  title: string;
  meta: string;
  rootUri: string;
  files: ReportFile[];
};

export async function buildReportPayload(uri: vscode.Uri, currentText: string): Promise<ReportPayload> {
  return buildSingleFilePayload(uri, currentText);
}

function buildSingleFilePayload(uri: vscode.Uri, content: string): ReportPayload {
  const name = path.basename(uri.fsPath || uri.path);
  const label = name.replace(/\.md$/i, "");
  return {
    ok: true,
    title: name,
    meta: "",
    rootUri: uri.toString(),
    files: [
      {
        name,
        label,
        uri: uri.toString(),
        content,
        headings: extractMarkdownHeadings(content, label)
      }
    ]
  };
}
