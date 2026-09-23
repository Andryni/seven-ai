import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy } from 'lucide-react-native';
import { FONT } from '../theme/typography';
import { splitBlocks, tokenizeInline, type InlineToken } from '../core/markdown';

/**
 * Minimal Markdown renderer for chat answers.
 *
 * Gemini answers routinely come back with **bold**, `inline code`, fenced
 * ```code blocks```, bullet/numbered lists and links — before this component
 * every one of those markers was shown to the user literally (asterisks and
 * backticks included), which is the fastest way to make an AI answer look
 * unfinished. The parsing itself lives in `src/core/markdown.ts` (no RN
 * import, so it is trivially unit-tested); this file only renders it.
 */

interface MarkdownTextProps {
  text: string;
  /** Base color for plain text (bold/italic inherit it). */
  color: string;
  /** Slightly dimmed color used for link/code accents. */
  accentColor?: string;
  fontSize?: number;
  lineHeight?: number;
}

const InlineRun: React.FC<{
  tokens: InlineToken[];
  color: string;
  accentColor: string;
  fontSize: number;
}> = ({ tokens, color, accentColor, fontSize }) => (
  <Text style={{ color, fontFamily: FONT.ui, fontSize }}>
    {tokens.map((tok, i) => {
      switch (tok.kind) {
        case 'bold':
          return (
            <Text key={i} style={{ fontFamily: FONT.uiMedium, fontWeight: '800' as const }}>
              {tok.value}
            </Text>
          );
        case 'italic':
          return (
            <Text key={i} style={{ fontStyle: 'italic' as const }}>
              {tok.value}
            </Text>
          );
        case 'code':
          return (
            <Text
              key={i}
              style={{
                fontFamily: FONT.mono,
                fontSize: fontSize - 1,
                color: accentColor,
                backgroundColor: 'rgba(255,255,255,0.08)',
              }}
            >
              {' '}
              {tok.value}{' '}
            </Text>
          );
        case 'link':
          return (
            <Text
              key={i}
              style={{ color: accentColor, textDecorationLine: 'underline' as const }}
              onPress={() => Linking.openURL(tok.href).catch(() => {})}
            >
              {tok.value}
            </Text>
          );
        default:
          return <Text key={i}>{tok.value}</Text>;
      }
    })}
  </Text>
);

/** Fenced code block with its own copy button — the one place a raw answer
 * genuinely benefits from monospace and a dark well, unlike the rest of the
 * conversation which reads as prose. */
const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // no-op: clipboard failures are not worth surfacing here
    }
  };
  return (
    <View style={mdStyles.codeBlock}>
      <View style={mdStyles.codeHeader}>
        <Text style={mdStyles.codeLang}>{(language || 'code').toUpperCase()}</Text>
        <TouchableOpacity
          style={mdStyles.codeCopyBtn}
          accessibilityLabel={copied ? 'Copied' : 'Copy code'}
          onPress={onCopy}
          hitSlop={6}
        >
          {copied ? (
            <Check size={11} color="#00FFA3" />
          ) : (
            <Copy size={11} color="rgba(255,255,255,0.6)" />
          )}
        </TouchableOpacity>
      </View>
      <Text style={mdStyles.codeText} selectable>
        {code}
      </Text>
    </View>
  );
};

export const MarkdownText: React.FC<MarkdownTextProps> = ({
  text,
  color,
  accentColor,
  fontSize = 13.5,
  lineHeight = 20,
}) => {
  const blocks = useMemo(() => splitBlocks(text), [text]);
  const accent = accentColor || color;

  return (
    <View style={{ gap: 8 }}>
      {blocks.map((block, idx) => {
        if (block.kind === 'code') {
          return <CodeBlock key={idx} code={block.code} language={block.language} />;
        }
        if (block.kind === 'heading') {
          const sizeBump = block.level === 1 ? 4 : block.level === 2 ? 2 : 1;
          return (
            <Text
              key={idx}
              style={{
                fontFamily: FONT.uiMedium,
                fontWeight: '800',
                color,
                fontSize: fontSize + sizeBump,
                lineHeight: lineHeight + sizeBump,
                marginTop: idx === 0 ? 0 : 2,
              }}
            >
              {block.text}
            </Text>
          );
        }
        if (block.kind === 'list') {
          return (
            <View key={idx} style={{ gap: 4 }}>
              {block.items.map((item, i) => (
                <View key={i} style={mdStyles.listRow}>
                  <Text style={{ color: accent, fontFamily: FONT.mono, fontSize, lineHeight }}>
                    {block.ordered ? `${i + 1}.` : '•'}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <InlineRun
                      tokens={tokenizeInline(item)}
                      color={color}
                      accentColor={accent}
                      fontSize={fontSize}
                    />
                  </View>
                </View>
              ))}
            </View>
          );
        }
        return (
          <View key={idx}>
            <InlineRun
              tokens={tokenizeInline(block.text)}
              color={color}
              accentColor={accent}
              fontSize={fontSize}
            />
          </View>
        );
      })}
    </View>
  );
};

const mdStyles = StyleSheet.create({
  codeBlock: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  codeLang: {
    fontFamily: FONT.mono,
    fontSize: 8.5,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.5)',
  },
  codeCopyBtn: {
    padding: 2,
  },
  codeText: {
    fontFamily: FONT.mono,
    fontSize: 11.5,
    lineHeight: 17,
    color: '#B8F5D0',
    padding: 8,
  },
  listRow: {
    flexDirection: 'row',
    gap: 6,
  },
});
