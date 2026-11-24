import React, { memo, useState } from "react";
import { View, Text, TextInput, Pressable, Linking, Modal, ScrollView, useWindowDimensions } from "react-native";
import Markdown from "react-native-markdown-display";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Chart } from "./Chart";
import { PlanCard } from "./PlanCard";
import type { Row, Bot } from "../../../packages/contracts/src/types";
import { Button, IconButton, styles as s } from "./UI";
import { FadeIn } from "./motion";
import { client, authHeaders, connectApp } from "../lib/session";
import { palette as p, type, space, radius } from "../theme";
import { bubbleFor } from "../../../packages/contracts/src/characters";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { fetch as nativeFetch } from "expo/fetch";
import { t, mirror } from "../lib/i18n";
const rtl = (text: string) => /[֐-ࣿ]/.test(text.trim().charAt(0));
async function openFile(url: string, name: string) {
  const absolute = new URL(url, client.base);
  if (absolute.origin !== client.base) throw Error(t("This file is hosted outside your workspace."));
  const response = await nativeFetch(absolute.href, { headers: authHeaders() });
  if (!response.ok) throw Error(t("Unable to download this file."));
  const file = new File(Paths.cache, `${Date.now()}-${name.replace(/[^\w.\-]/g, "_")}`);
  file.write(new Uint8Array(await response.arrayBuffer()));
  await Sharing.shareAsync(file.uri);
}
/** Bots link files in their Library by their path on the computer; fetch and share them. */
async function openLibraryFile(botId: string, fullPath: string) {
  const m = /^\/root\/grokbot\/files\/[^/]+\/(.+)$/.exec(decodeURI(fullPath));
  if (!m) throw Error(t("This file can't be opened."));
  const { url } = await client.request<{ url: string }>("POST", `/bots/${botId}/files/download`, { path: m[1] });
  const name = m[1].split("/").pop() ?? "file";
  if (url.startsWith("data:")) {
    const file = new File(Paths.cache, `${Date.now()}-${name.replace(/[^\w.\-]/g, "_")}`);
    file.write(url.slice(url.indexOf(",") + 1), { encoding: "base64" });
    await Sharing.shareAsync(file.uri);
  } else await Linking.openURL(url);
}
/**
 * Your message text, sized to its longest line. iOS lays out wrapped text at the full width it is
 * offered, which leaves an empty strip inside the bubble; measuring the lines lets the bubble hug it.
 */
function FitText({ text, color }: { text: string; color: string }) {
  const [width, setWidth] = useState<number>();
  const right = rtl(text);
  return (
    <Text
      selectable
      onTextLayout={(e) => {
        const lines = e.nativeEvent.lines;
        if (lines.length < 2) return;
        const widest = Math.ceil(Math.max(...lines.map((l) => l.width))) + 1;
        if (widest !== width) setWidth(widest);
      }}
      style={{ width, color, fontSize: 16, lineHeight: 23, writingDirection: right ? "rtl" : "ltr", textAlign: right ? "right" : "left" }}
    >
      {text}
    </Text>
  );
}
const time = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Rows that just arrived glide in; history renders still. */
function Enter({ row, children }: { row: Row; children: React.ReactNode }) {
  return Date.now() - row.createdAt < 8000 ? (
    <FadeIn offset={8} duration={280}>
      {children}
    </FadeIn>
  ) : (
    <>{children}</>
  );
}

function Message({ row, bot, seen, canRetry }: { row: Row; bot: Bot; seen?: boolean; canRetry?: boolean }) {
  const [answer, setAnswer] = useState("");
  const [expanded, setExpanded] = useState(false),
    [details, setDetails] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [viewer, setViewer] = useState<string | null>(null);
  const body = row.body;
  // Replies appear whole (with a short fade for new ones), never typed out word by word.
  const text = body.type === "message" ? body.text : "";
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
  if (body.type === "plan") return <PlanCard body={body} bot={bot} />;
  if (body.type === "tool-call") {
    const failed = body.status === "error" || body.status === "denied";
    return (
      <View style={{ paddingHorizontal: space.lg, paddingVertical: 3 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Show step details")}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          style={[s.row, { gap: 10, minHeight: 32 }]}
        >
          <Ionicons
            name={failed ? "close-circle" : body.status === "running" ? "ellipse-outline" : "checkmark-circle"}
            size={15}
            color={failed ? p.red : body.status === "running" ? p.muted : p.faint}
          />
          <Text style={[type.footnote, { color: failed ? p.red : p.muted, flex: 1 }]} numberOfLines={expanded ? undefined : 1}>
            {body.label || body.name}
          </Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={13} color={p.faint} />
        </Pressable>
        {expanded && (
          <FadeIn offset={4} duration={200} style={[s.card, { marginTop: 6, marginLeft: 25, padding: space.md }]}>
            <Text selectable style={[type.caption, { color: p.faint }]}>
              {body.name} · {body.status}
            </Text>
            {!!body.summary && (
              <Text selectable style={[type.subhead, { color: p.text }]}>
                {body.summary}
              </Text>
            )}
            {body.args !== undefined && (
              <Text selectable style={{ color: p.muted, fontFamily: "Menlo", fontSize: 11, lineHeight: 16 }}>
                {JSON.stringify(body.args, null, 2)}
              </Text>
            )}
          </FadeIn>
        )}
      </View>
    );
  }
  if (body.type === "event" || body.type === "notice")
    return (
      <Enter row={row}>
        <View style={{ alignItems: "center", paddingHorizontal: space.xl, paddingVertical: space.sm }}>
          <View style={[s.row, { gap: 6, backgroundColor: p.surface, borderRadius: radius.full, paddingHorizontal: space.md, paddingVertical: 6, borderWidth: 1, borderColor: p.line, maxWidth: "100%" }]}>
            <Ionicons
              name={body.type === "notice" ? "information-circle-outline" : /call/i.test(body.text) ? "call-outline" : "sparkles-outline"}
              size={13}
              color={body.type === "notice" && body.tone === "warn" ? p.amber : p.muted}
            />
            <Text style={[type.caption, { color: p.muted, fontWeight: "500", flexShrink: 1 }]} numberOfLines={2}>
              {body.text}
            </Text>
          </View>
        </View>
      </Enter>
    );
  if (body.type === "card") {
    const icon =
      body.card === "approval" ? "shield-checkmark-outline" : body.card === "question" ? "help-circle-outline" : body.card === "connect" ? "link-outline" : "create-outline";
    const title =
      body.card === "approval" ? body.summary || body.title : body.card === "question" ? body.question : body.card === "connect" ? t("Connect {name}", { name: body.toolkitName }) : t("Draft to {name}", { name: body.to });
    const done = body.status !== "pending";
    return (
      <Enter row={row}>
        <View style={[s.card, { marginHorizontal: space.lg, marginVertical: space.sm, gap: space.md, opacity: done ? 0.75 : 1 }]}>
          <View style={[s.row, { gap: 10, alignItems: "flex-start" }]}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: p.raised, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={icon} size={16} color={p.text} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              {body.card === "approval" && !!body.summary && (
                <Text style={[type.footnote, { color: p.muted }]}>{t("{name} wants your OK to:", { name: bot.name })}</Text>
              )}
              <Text style={[type.headline, { color: p.text, paddingTop: body.card === "approval" && body.summary ? 0 : 4 }]}>{title}</Text>
            </View>
          </View>
          {body.card === "approval" && (
            <>
              {body.summary ? (
                <>
                  {!!body.reason && <Text style={[type.footnote, { color: p.muted }]}>{t(body.reason)}</Text>}
                  {!!body.technical && (
                    <Pressable accessibilityRole="button" onPress={() => setDetails((v) => !v)} hitSlop={6} style={[s.row, { gap: 4 }]}>
                      <Text style={[type.footnote, { color: p.faint, fontWeight: "600" }]}>{details ? t("Hide details") : t("Show details")}</Text>
                      <Ionicons name={details ? "chevron-up" : "chevron-down"} size={13} color={p.faint} />
                    </Pressable>
                  )}
                  {details && !!body.technical && (
                    <Text selectable style={{ color: p.muted, fontFamily: "Menlo", fontSize: 12, lineHeight: 18, backgroundColor: p.background, borderRadius: radius.sm, padding: space.md }}>
                      {body.technical}
                    </Text>
                  )}
                </>
              ) : (
                !!body.detail && (
                  <Text selectable style={{ color: p.muted, fontFamily: "Menlo", fontSize: 12, lineHeight: 18, backgroundColor: p.background, borderRadius: radius.sm, padding: space.md }}>
                    {body.detail}
                  </Text>
                )
              )}
              {body.status === "pending" ? (
                <View style={{ gap: space.sm }}>
                  <View style={[s.row, { gap: space.sm }]}>
                    <Button title={t("Deny")} variant="secondary" compact busy={busy} style={{ flex: 1 }} onPress={() => void act(`/approvals/${body.approvalId}`, { decision: "deny" })} />
                    <Button title={body.requiresFreshApproval ? t("Allow once") : t("Allow")} compact busy={busy} style={{ flex: 1 }} onPress={() => void act(`/approvals/${body.approvalId}`, { decision: "allow" })} />
                  </View>
                  {!body.requiresFreshApproval && (
                    <Button title={t("Always allow this")} variant="ghost" compact disabled={busy} onPress={() => void act(`/approvals/${body.approvalId}`, { decision: "always" })} />
                  )}
                </View>
              ) : (
                <Status label={body.status === "denied" ? t("Denied") : body.status === "expired" ? t("Expired") : body.status === "always" ? t("Always allowed") : t("Allowed")} ok={body.status === "allowed" || body.status === "always"} />
              )}
            </>
          )}
          {body.card === "question" &&
            (body.status === "pending" ? (
              <View style={{ gap: space.sm }}>
                {body.options.map((option) => (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void act(`/bots/${bot.id}/cards/${row.seq}/answer`, { generation: row.generation, answer: option })}
                    style={({ pressed }) => [
                      s.row,
                      { minHeight: 46, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: pressed ? p.elevated : p.raised },
                    ]}
                  >
                    <Text style={[type.callout, { color: p.text, flex: 1 }]}>{option}</Text>
                    <Ionicons name="arrow-forward" size={15} color={p.faint} style={mirror("arrow-forward")} />
                  </Pressable>
                ))}
                <View style={[s.row, { gap: 6, backgroundColor: p.background, borderRadius: radius.md, paddingLeft: space.md, paddingRight: 4, minHeight: 46 }]}>
                  <TextInput
                    accessibilityLabel={t("Your own answer")}
                    placeholder={t("Or type your answer")}
                    placeholderTextColor={p.faint}
                    value={answer}
                    onChangeText={setAnswer}
                    multiline
                    style={[type.callout, { color: p.text, flex: 1, paddingVertical: 10 }]}
                  />
                  <IconButton
                    name="arrow-up"
                    label={t("Send answer")}
                    variant="primary"
                    size={34}
                    iconSize={18}
                    disabled={!answer.trim() || busy}
                    onPress={() => void act(`/bots/${bot.id}/cards/${row.seq}/answer`, { generation: row.generation, answer })}
                  />
                </View>
              </View>
            ) : (
              <Status label={body.answer ?? body.status} ok />
            ))}
          {body.card === "connect" && (
            <>
              <Text style={[type.subhead, { color: p.muted }]}>{body.reason}</Text>
              {body.status === "connected" ? (
                <Status label={t("Connected")} ok />
              ) : (
                <Button
                  title={t("Connect {name}", { name: body.toolkitName })}
                  icon="link"
                  compact
                  busy={busy}
                  onPress={() => {
                    setBusy(true);
                    void connectApp(body.toolkit, { botId: bot.id, seq: row.seq, generation: row.generation })
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(false));
                  }}
                />
              )}
            </>
          )}
          {body.card === "draft" && (
            <>
              <View style={{ backgroundColor: p.background, borderRadius: radius.md, padding: space.md, gap: 6, borderLeftWidth: 2, borderLeftColor: p.lineStrong }}>
                {!!body.subject && <Text style={[type.headline, { color: p.text }]}>{body.subject}</Text>}
                <Text selectable style={[type.callout, { color: p.text }]}>
                  {body.text}
                </Text>
              </View>
              {body.status === "pending" ? (
                <Button title={t("Send")} icon="paper-plane" compact busy={busy} onPress={() => void act(`/approvals/${body.approvalId}`, { decision: "allow" })} />
              ) : (
                <Status label={t("Sent")} ok />
              )}
            </>
          )}
          {!!error && <Text style={[type.footnote, { color: p.red }]}>{error}</Text>}
        </View>
      </Enter>
    );
  }
  const user = body.role === "user";
  const hasBody = !!text || !!body.files?.length;
  // Your bubble wears the bot's color, so every chat looks like that bot's own.
  const bubble = bubbleFor(bot.avatarColor);
  return (
    <Enter row={row}>
      <View style={{ paddingHorizontal: space.lg, paddingVertical: user ? 6 : 10, alignItems: user ? "flex-end" : "flex-start" }}>
        <View
          style={{
            maxWidth: user ? "84%" : "100%",
            alignSelf: user ? "flex-end" : "stretch",
            backgroundColor: user && hasBody ? bubble.bg : "transparent",
            borderRadius: 22,
            borderBottomRightRadius: user ? 6 : 22,
            paddingHorizontal: user && hasBody ? space.lg : 2,
            paddingVertical: user && hasBody ? 10 : 0,
            gap: space.md,
          }}
        >
          {!!text && user && (
            // Plain text, not Markdown: Markdown paragraphs stretch to full width and puff the bubble up.
            <FitText text={text} color={bubble.ink} />
          )}
          {!!text && !user && (
            <Markdown
              style={{
                body: { color: user ? "#fff" : p.text, fontSize: user ? 16 : 16.5, lineHeight: user ? 23 : 26, writingDirection: rtl(text) ? "rtl" : "auto" },
                paragraph: { marginTop: 0, marginBottom: user ? 0 : 10 },
                textgroup: { width: "100%", writingDirection: rtl(text) ? "rtl" : "auto", textAlign: rtl(text) ? "right" : "left" },
                heading1: { fontSize: 24, lineHeight: 31, fontWeight: "700", color: p.text, marginBottom: 8 },
                heading2: { fontSize: 20, lineHeight: 27, fontWeight: "700", color: p.text, marginBottom: 6 },
                heading3: { fontSize: 17, lineHeight: 24, fontWeight: "600", color: p.text },
                strong: { fontWeight: "700" },
                bullet_list_icon: { color: p.muted },
                ordered_list_icon: { color: p.muted },
                link: { color: user ? "#fff" : p.blue, textDecorationLine: user ? "underline" : "none" },
                code_inline: { backgroundColor: p.raised, color: p.text, fontFamily: "Menlo", fontSize: 14, borderRadius: 6, paddingHorizontal: 4 },
                fence: { backgroundColor: p.surface, color: p.text, borderColor: p.line },
                hr: { backgroundColor: p.line },
                table: { borderColor: p.line },
                tr: { borderColor: p.line },
                th: { padding: 10, width: 160, minWidth: 160, maxWidth: 160, flexGrow: 0, flexShrink: 0 },
                td: { padding: 10, width: 160, minWidth: 160, maxWidth: 160, flexGrow: 0, flexShrink: 0 },
                blockquote: { backgroundColor: "transparent", borderLeftColor: p.lineStrong, borderLeftWidth: 3, paddingLeft: 12, marginLeft: 0 },
              }}
              rules={{
                table: (node, children) => (
                  <ScrollView key={node.key} horizontal showsHorizontalScrollIndicator>
                    <View style={{ borderWidth: 0.5, borderColor: p.line, borderRadius: radius.sm, overflow: "hidden" }}>{children}</View>
                  </ScrollView>
                ),
                fence: (node) => {
                  const language = String((node as unknown as { sourceInfo?: string }).sourceInfo ?? "").trim();
                  return language === "chart" || language === "fino-chart" ? (
                    <Chart key={node.key} raw={node.content} />
                  ) : (
                    <View key={node.key} style={{ backgroundColor: p.surface, borderRadius: radius.md, borderWidth: 1, borderColor: p.line, marginVertical: 6, overflow: "hidden" }}>
                      {!!language && (
                        <Text style={[type.caption, { color: p.faint, paddingHorizontal: space.md, paddingTop: space.sm }]}>{language}</Text>
                      )}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <Text selectable style={{ color: p.text, fontFamily: "Menlo", fontSize: 13, lineHeight: 19, padding: space.md }}>
                          {node.content.replace(/\n$/, "")}
                        </Text>
                      </ScrollView>
                    </View>
                  );
                },
              }}
              onLinkPress={(url) => {
                if (/^https?:\/\//.test(url)) void Linking.openURL(url);
                else if (url.startsWith("/root/grokbot/files/")) void openLibraryFile(bot.id, url).catch((e) => setError(e.message));
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
              accessibilityLabel={t("Open {name}", { name: file.name })}
              onPress={() => void openFile(file.url, file.name).catch((e) => setError(e.message))}
              style={({ pressed }) => [s.row, { padding: space.md, backgroundColor: pressed ? p.elevated : user ? p.elevated : p.surface, borderRadius: radius.md, borderWidth: 1, borderColor: p.line }]}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: p.raised, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="document-text-outline" size={18} color={p.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.subhead, { color: p.text, fontWeight: "600" }]} numberOfLines={1}>
                  {file.name}
                </Text>
                <Text style={[type.caption, { color: p.muted, fontWeight: "400" }]}>{Math.ceil(file.size / 1024)} KB</Text>
              </View>
              <Ionicons name="share-outline" size={17} color={p.muted} />
            </Pressable>
          ))}
          {!!body.citations?.length && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {body.citations.map((citation, i) => (
                <Pressable
                  key={i}
                  onPress={() => void Linking.openURL(citation.url)}
                  style={[s.row, { gap: 5, backgroundColor: p.surface, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: p.line }]}
                >
                  <Ionicons name="globe-outline" size={12} color={p.muted} />
                  <Text style={[type.caption, { color: p.muted, fontWeight: "500", maxWidth: 160 }]} numberOfLines={1}>
                    {citation.title ?? new URL(citation.url).hostname}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {!!error && <Text style={[type.footnote, { color: p.red }]}>{error}</Text>}
          {user && !!body.reaction && (
            <FadeIn offset={0} duration={300} style={{ position: "absolute", bottom: -14, left: -8 }}>
              <View accessibilityLabel={t("Reacted {emoji}", { emoji: body.reaction })} style={{ minWidth: 30, height: 30, paddingHorizontal: 5, borderRadius: 15, backgroundColor: p.raised, borderWidth: 2, borderColor: p.background, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 16 }}>{body.reaction}</Text>
              </View>
            </FadeIn>
          )}
        </View>
        {body.images?.map((image) => (
          <Pressable
            key={image.id}
            style={{ width: user ? "80%" : "100%", marginTop: space.sm, alignSelf: user ? "flex-end" : "stretch" }}
            accessibilityRole="button"
            accessibilityLabel={t("Enlarge {name}", { name: image.name })}
            onPress={() => setViewer(new URL(image.url, client.base).href)}
          >
            <Image
              source={{ uri: new URL(image.url, client.base).href, headers: authHeaders() }}
              style={{ width: "100%", height: 240, borderRadius: radius.lg, backgroundColor: p.surface }}
              contentFit="cover"
              transition={200}
            />
          </Pressable>
        ))}
        {(user || !body.streaming) && (
          <View style={[s.row, { gap: space.md, marginTop: user && body.reaction ? 14 : 4, marginHorizontal: 4 }]}>
            <Text style={[type.caption, { color: p.faint, fontWeight: "400" }]}>{time(row.createdAt)}</Text>
            {user && seen && !!body.seenAt && <Text style={[type.caption, { color: p.faint, fontWeight: "500" }]}>{t("Seen")}</Text>}
            {canRetry && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("Try again")}
                hitSlop={10}
                disabled={busy}
                onPress={() => void act(`/bots/${bot.id}/regenerate`, { generation: row.generation })}
                style={({ pressed }) => [s.row, { gap: 4, opacity: pressed || busy ? 0.5 : 1 }]}
              >
                <Ionicons name="refresh" size={13} color={p.muted} />
                <Text style={[type.caption, { color: p.muted, fontWeight: "500" }]}>{t("Try again")}</Text>
              </Pressable>
            )}
          </View>
        )}
        <Modal visible={!!viewer} animationType="fade" transparent onRequestClose={() => setViewer(null)}>
          <View style={{ flex: 1, backgroundColor: "#000000f2", paddingTop: 54 }}>
            <View style={{ alignItems: "flex-end", paddingRight: space.md }}>
              <IconButton name="close" label={t("Close image")} variant="filled" onPress={() => setViewer(null)} />
            </View>
            <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
              {viewer && <Image source={{ uri: viewer, headers: authHeaders() }} style={{ width, height: height - 160 }} contentFit="contain" />}
            </ScrollView>
          </View>
        </Modal>
      </View>
    </Enter>
  );
}
function Status({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={[s.row, { gap: 6 }]}>
      <Ionicons name={ok ? "checkmark-circle" : "close-circle"} size={15} color={ok ? p.green : p.red} />
      <Text style={[type.subhead, { color: p.muted }]}>{label}</Text>
    </View>
  );
}
export const MessageRow = memo(
  Message,
  (a, b) =>
    a.row === b.row && a.seen === b.seen && a.canRetry === b.canRetry &&
    a.bot.name === b.bot.name && a.bot.avatarShape === b.bot.avatarShape && a.bot.avatarColor === b.bot.avatarColor,
);
