import React, { memo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Linking,
  Modal,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { Image } from "expo-image";
import { useReveal } from "../lib/reveal";
import { Chart } from "./Chart";
import type { Row, Bot } from "../../../packages/contracts/src/types";
import { Avatar, Button, IconButton, styles as s } from "./UI";
import { client, authHeaders, connectApp } from "../lib/session";
import { palette as p, chatColors } from "../theme";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { fetch as nativeFetch } from "expo/fetch";
const rtl = (text: string) => /[\u0590-\u08ff]/.test(text.trim().charAt(0));
async function openFile(url: string, name: string) {
  const absolute = new URL(url, client.base);
  if (absolute.origin !== client.base)
    throw Error("This file is hosted outside your workspace.");
  const response = await nativeFetch(absolute.href, { headers: authHeaders() });
  if (!response.ok) throw Error("Unable to download this file.");
  const file = new File(
    Paths.cache,
    `${Date.now()}-${name.replace(/[^\w.\-]/g, "_")}`,
  );
  file.write(new Uint8Array(await response.arrayBuffer()));
  await Sharing.shareAsync(file.uri);
}
function Message({ row, bot }: { row: Row; bot: Bot }) {
  const [answer, setAnswer] = useState("");
  const [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [viewer, setViewer] = useState<string | null>(null);
  const body = row.body;
  const text = useReveal(
    body.type === "message" ? body.text : "",
    body.type === "message" && !!body.streaming,
  );
  const { width, height } = useWindowDimensions();
  const act = async (path: string, data: unknown) => {
    setBusy(true);
    setError("");
    try {
      await client.request("POST", path, data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (body.type === "tool-call")
    return (
      <View style={{ paddingHorizontal: 18, paddingVertical: 5 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show work details"
          onPress={() => setExpanded(!expanded)}
          style={s.row}
        >
          <Text style={{ color: body.status === "error" ? p.red : p.blue }}>
            ●
          </Text>
          <Text
            style={[s.muted, { flex: 1 }]}
            numberOfLines={expanded ? undefined : 1}
          >
            {body.label || body.name}
          </Text>
          <Text style={s.muted}>{expanded ? "−" : "+"}</Text>
        </Pressable>
        {expanded && (
          <View style={[s.card, { marginTop: 8 }]}>
            <Text selectable style={s.muted}>
              {body.name} · {body.status}
            </Text>
            {!!body.summary && (
              <Text selectable style={s.text}>
                {body.summary}
              </Text>
            )}
            {body.args !== undefined && (
              <Text selectable style={s.muted}>
                {JSON.stringify(body.args, null, 2)}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  if (body.type === "event" || body.type === "notice")
    return (
      <Text style={[s.muted, { paddingHorizontal: 20, paddingVertical: 8 }]}>
        {body.text}
      </Text>
    );
  if (body.type === "card")
    return (
      <View style={[s.card, { margin: 16 }]}>
        <Text style={[s.text, { fontWeight: "600" }]}>
          {body.card === "approval"
            ? body.title
            : body.card === "question"
              ? body.question
              : body.card === "connect"
                ? `Connect ${body.toolkitName}`
                : `Draft to ${body.to}`}
        </Text>
        {body.card === "approval" && (
          <>
            <Text selectable style={s.muted}>
              {body.detail}
            </Text>
            {body.status === "pending" ? (
              <View style={{ gap: 8 }}>
                <Button
                  title="Allow once"
                  busy={busy}
                  onPress={() =>
                    void act(`/approvals/${body.approvalId}`, {
                      decision: "allow",
                    })
                  }
                />
                {!body.requiresFreshApproval && (
                  <Button
                    title="Always allow"
                    secondary
                    busy={busy}
                    onPress={() =>
                      void act(`/approvals/${body.approvalId}`, {
                        decision: "always",
                      })
                    }
                  />
                )}
                <Button
                  title="Deny"
                  secondary
                  busy={busy}
                  onPress={() =>
                    void act(`/approvals/${body.approvalId}`, {
                      decision: "deny",
                    })
                  }
                />
              </View>
            ) : (
              <Text style={s.muted}>{body.status}</Text>
            )}
          </>
        )}
        {body.card === "question" &&
          (body.status === "pending" ? (
            <View style={{ gap: 8 }}>
              {body.options.map((option) => (
                <Button
                  key={option}
                  title={option}
                  secondary
                  busy={busy}
                  onPress={() =>
                    void act(`/bots/${bot.id}/cards/${row.seq}/answer`, {
                      generation: row.generation,
                      answer: option,
                    })
                  }
                />
              ))}
              <TextInput
                accessibilityLabel="Your answer"
                placeholder="Your answer"
                placeholderTextColor={p.muted}
                value={answer}
                onChangeText={setAnswer}
                multiline
                style={s.input}
              />
              <Button
                title="Send answer"
                disabled={!answer.trim()}
                busy={busy}
                onPress={() =>
                  void act(`/bots/${bot.id}/cards/${row.seq}/answer`, {
                    generation: row.generation,
                    answer,
                  })
                }
              />
            </View>
          ) : (
            <Text style={s.text}>{body.answer ?? body.status}</Text>
          ))}
        {body.card === "connect" && (
          <>
            <Text style={s.muted}>{body.reason}</Text>
            <Button
              title={
                body.status === "connected" ? "Connected" : "Connect account"
              }
              disabled={body.status === "connected"}
              busy={busy}
              onPress={() => {
                setBusy(true);
                void connectApp(body.toolkit, {
                  botId: bot.id,
                  seq: row.seq,
                  generation: row.generation,
                })
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            />
          </>
        )}
        {body.card === "draft" && (
          <>
            <Text style={s.text}>{body.subject}</Text>
            <Text selectable style={s.text}>
              {body.text}
            </Text>
            {body.status === "pending" && (
              <Button
                title="Send draft"
                busy={busy}
                onPress={() =>
                  void act(`/approvals/${body.approvalId}`, {
                    decision: "allow",
                  })
                }
              />
            )}
          </>
        )}
        {!!error && <Text style={{ color: p.red }}>{error}</Text>}
      </View>
    );
  const user = body.role === "user",
    color = chatColors[bot.avatarColor] ?? chatColors.blue;
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 10,
        alignItems: user ? "flex-end" : "flex-start",
      }}
    >
      {!user && (
        <View style={[s.row, { marginBottom: 8 }]}>
          <Avatar shape={bot.avatarShape} size={28} />
          <Text style={s.label}>{body.from?.name ?? bot.name}</Text>
        </View>
      )}
      <View
        style={{
          maxWidth: user ? "92%" : "100%",
          alignSelf: user ? "flex-end" : "stretch",
          backgroundColor:
            !text && !body.files?.length
              ? "transparent"
              : user
                ? color
                : p.surface,
          borderRadius: 20,
          borderTopRightRadius: user ? 6 : 20,
          borderTopLeftRadius: user ? 20 : 6,
          padding: !text && !body.files?.length ? 0 : 16,
          gap: 12,
        }}
      >
        {!!text && (
          <Markdown
            style={{
              body: {
                color: p.text,
                fontSize: 17,
                lineHeight: 27,
                writingDirection: rtl(text) ? "rtl" : "auto",
              },
              paragraph: { marginTop: 0, marginBottom: 10 },
              textgroup: {
                width: "100%",
                writingDirection: rtl(text) ? "rtl" : "auto",
                textAlign: rtl(text) ? "right" : "left",
              },
              heading1: { fontSize: 24, lineHeight: 32, color: p.text },
              heading2: { fontSize: 21, lineHeight: 29, color: p.text },
              link: { color: "#a2ceff" },
              code_inline: { backgroundColor: p.raised, color: p.text },
              fence: {
                backgroundColor: p.background,
                color: p.text,
                borderColor: p.line,
              },
              table: { borderColor: p.line },
              tr: { borderColor: p.line },
              th: { padding: 10,width:160,minWidth:160,maxWidth:160,flexGrow:0,flexShrink:0 },
              td: { padding: 10,width:160,minWidth:160,maxWidth:160,flexGrow:0,flexShrink:0 },
              blockquote: {
                backgroundColor: p.raised,
                borderLeftColor: p.blue,
              },
            }}
            rules={{
              table:(node,children)=><ScrollView key={node.key} horizontal showsHorizontalScrollIndicator><View style={{borderWidth:.5,borderColor:p.line}}>{children}</View></ScrollView>,
              fence: (node) => {
                const language = String(
                  (node as unknown as { sourceInfo?: string }).sourceInfo ?? "",
                ).trim();
                return language === "chart" || language === "fino-chart" ? (
                  <Chart key={node.key} raw={node.content} />
                ) : (
                  <Text
                    key={node.key}
                    selectable
                    style={[
                      s.muted,
                      {
                        fontFamily: "Courier",
                        padding: 12,
                        backgroundColor: p.background,
                      },
                    ]}
                  >
                    {node.content}
                  </Text>
                );
              },
            }}
            onLinkPress={(url) => {
              if (/^https?:\/\//.test(url)) void Linking.openURL(url);
              return false;
            }}
          >
            {text}
          </Markdown>
        )}
        {body.files?.map((file) => (
          <Pressable
            key={file.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${file.name}`}
            onPress={() =>
              void openFile(file.url, file.name).catch((e) =>
                setError(e.message),
              )
            }
            style={[
              s.row,
              { padding: 12, backgroundColor: p.raised, borderRadius: 12 },
            ]}
          >
            <Text style={s.text}>↗</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.text} numberOfLines={2}>
                {file.name}
              </Text>
              <Text style={s.muted}>{Math.ceil(file.size / 1024)} KB</Text>
            </View>
          </Pressable>
        ))}
        {body.citations?.map((citation, i) => (
          <Text
            key={i}
            style={{ color: p.blue }}
            onPress={() => void Linking.openURL(citation.url)}
          >
            {citation.title ?? new URL(citation.url).hostname}
          </Text>
        ))}
        {!!error && <Text style={{ color: p.red }}>{error}</Text>}
      </View>
      {body.images?.map((image) => (
        <Pressable
          key={image.id}
          style={{
            width: user ? "92%" : "100%",
            marginTop: 10,
            alignSelf: user ? "flex-end" : "stretch",
          }}
          accessibilityRole="button"
          accessibilityLabel={`Enlarge ${image.name}`}
          onPress={() => setViewer(new URL(image.url, client.base).href)}
        >
          <Image
            source={{
              uri: new URL(image.url, client.base).href,
              headers: authHeaders(),
            }}
            style={{ width: "100%", height: 240, borderRadius: 12 }}
            contentFit="contain"
          />
        </Pressable>
      ))}

      <Text
        style={[s.muted, { fontSize: 11, marginTop: 6, marginHorizontal: 4 }]}
      >
        {new Date(row.createdAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Text>
      <Modal
        visible={!!viewer}
        animationType="fade"
        onRequestClose={() => setViewer(null)}
      >
        <View style={{ flex: 1, backgroundColor: "#101820", paddingTop: 50 }}>
          <View style={{ alignItems: "flex-end", paddingRight: 12 }}>
            <IconButton
              name="close"
              label="Close image"
              onPress={() => setViewer(null)}
            />
          </View>
          <ScrollView
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          >
            {viewer && (
              <Image
                source={{ uri: viewer, headers: authHeaders() }}
                style={{ width, height: height - 160 }}
                contentFit="contain"
              />
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
export const MessageRow = memo(
  Message,
  (a, b) =>
    a.row === b.row &&
    a.bot.name === b.bot.name &&
    a.bot.avatarShape === b.bot.avatarShape &&
    a.bot.avatarColor === b.bot.avatarColor,
);
