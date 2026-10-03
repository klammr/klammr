/**
 * Lightbulb actions. Everything here delegates to commands owned by the chat
 * ([B]) and inline-edit ([D1]) modules, so this file has no AI logic of its own.
 *
 *   per diagnostic (Error/Warning/Info)  QuickFix "Fix in Chat: <message>"   → klammr.chat.fixDiagnostic(uri, diagnostic)
 *   with a non-empty selection           Refactor "Edit with Klammr (Ctrl+K)" → klammr.inlineEdit.open
 *                                        Refactor "Add to Chat"               → klammr.chat.addSelectionToChat
 *                                        Refactor "Explain with Klammr"       → klammr.chat.explainSelection
 */
import * as vscode from 'vscode';

export const KLAMMR_REFACTOR_KIND = vscode.CodeActionKind.Refactor.append('klammr');
export const PROVIDED_KINDS = [vscode.CodeActionKind.QuickFix, KLAMMR_REFACTOR_KIND];

const MAX_TITLE_MESSAGE = 60;

export class KlammrCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const only = context.only;

    if (!only || only.intersects(vscode.CodeActionKind.QuickFix)) {
      const seen = new Set<string>();
      for (const diagnostic of context.diagnostics) {
        if (diagnostic.severity === vscode.DiagnosticSeverity.Hint) continue;
        const key = `${diagnostic.range.start.line}:${diagnostic.range.start.character}|${diagnostic.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        actions.push(fixInChat(document, diagnostic));
      }
    }

    if (!range.isEmpty && (!only || only.intersects(KLAMMR_REFACTOR_KIND))) {
      actions.push(
        selectionAction('Edit with Klammr (Ctrl+K)', 'klammr.inlineEdit.open', 'edit'),
        selectionAction('Add to Chat', 'klammr.chat.addSelectionToChat', 'addToChat'),
        selectionAction('Explain with Klammr', 'klammr.chat.explainSelection', 'explain'),
      );
    }
    return actions;
  }
}

function fixInChat(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction {
  const action = new vscode.CodeAction(`Fix in Chat: ${shortMessage(diagnostic)}`, vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.command = {
    command: 'klammr.chat.fixDiagnostic',
    title: 'Fix in Chat',
    tooltip: 'Send this problem to the Klammr chat with the surrounding code',
    arguments: [document.uri, diagnostic],
  };
  return action;
}

function selectionAction(title: string, command: string, suffix: string): vscode.CodeAction {
  const action = new vscode.CodeAction(title, KLAMMR_REFACTOR_KIND.append(suffix));
  action.command = { command, title };
  return action;
}

function shortMessage(d: vscode.Diagnostic): string {
  const first = d.message.split('\n')[0].trim();
  const source = d.source ? `${d.source}: ` : '';
  const text = first.length > MAX_TITLE_MESSAGE ? `${first.slice(0, MAX_TITLE_MESSAGE - 1)}…` : first;
  return `${source}${text}`;
}
