import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Animated, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useWorkspace } from "../lib/store";
import { Avatar, Button, Chip, ErrorText, IconButton, KeyboardScreen, TextField, styles as s } from "../components/UI";
import { FadeIn, TypingDots, useLoop } from "../components/motion";
import { palette as p, type, space, radius, fruits } from "../theme";
import { catalog, starterTeams, templateById, type BotTemplate } from "../lib/catalog";
import { installTemplate, isInstalled, markOnboarded, rememberProfile } from "../lib/install";
import { t as tr, n, mirror } from "../lib/i18n";

type Step = "welcome" | "about" | "use" | "team" | "pick" | "build";
type Team = "accounting" | "hr" | "other";
const jobs = ["Founder", tr("Accountant"), tr("HR"), tr("Marketing"), tr("Developer"), "Student"];
const teams: { id: Team; label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; detail: string }[] = [
  { id: "accounting", label: tr("Accounting & Finance"), icon: "calculator-outline", detail: tr("Bills, invoices, payroll and cash flow") },
  { id: "hr", label: tr("HR & People"), icon: "people-outline", detail: tr("Hiring, onboarding and policy questions") },
  { id: "other", label: tr("Something else"), icon: "sparkles-outline", detail: tr("Email, research and content to start") },
];

export function OnboardingScreen({ done }: { done: () => void }) {
  const user = useWorkspace((x) => x.user);
  const bots = useWorkspace((x) => x.bots);
  const primary = bots.find((b) => b.isPrimary);
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("welcome"),
    [name, setName] = useState(user?.name && user.name !== "Mobile QA" ? user.name : ""),
    [job, setJob] = useState(""),
    [use, setUse] = useState<"personal" | "work" | null>(null),
    [team, setTeam] = useState<Team | null>(null),
    [picked, setPicked] = useState<string[]>([]);
  const order: Step[] = use === "work" ? ["welcome", "about", "use", "team", "pick", "build"] : ["welcome", "about", "use", "pick", "build"];
  const index = order.indexOf(step);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: index / (order.length - 1), duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [index, order.length]);
  const go = (next: Step) => {
    void Haptics.selectionAsync();
    setStep(next);
  };
  const back = () => index > 0 && step !== "build" && go(order[index - 1]);
  const skip = async () => {
    await markOnboarded(user);
    done();
  };
  const choosePack = (key: keyof typeof starterTeams) => setPicked(starterTeams[key].filter((id) => !bots.some((b) => b.label === templateById(id)?.label)));

  return (
    <KeyboardScreen style={{ paddingTop: insets.top }}>
      {/* top bar: back · progress · skip */}
      <View style={[s.row, { paddingHorizontal: space.sm, height: 52, gap: space.sm }]}>
        <View style={{ width: 44 }}>{index > 0 && step !== "build" && <IconButton name="chevron-back" label={tr("Back")} onPress={back} />}</View>
        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: p.raised, overflow: "hidden" }}>
          <Animated.View style={{ height: 4, borderRadius: 2, backgroundColor: p.text, width: progress.interpolate({ inputRange: [0, 1], outputRange: ["4%", "100%"] }) }} />
        </View>
        <View style={{ width: 52, alignItems: "flex-end", paddingRight: space.sm }}>
          {step !== "build" && (
            <Pressable onPress={() => void skip()} hitSlop={10} accessibilityRole="button">
              <Text style={[type.subhead, { color: p.muted }]}>{tr("Skip")}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {step === "welcome" && <Welcome onNext={() => go("about")} />}
      {step === "about" && (
        <StepShell
          key="about"
          title={tr("Tell us about you")}
          subtitle={tr("Your bots use this to tailor their help.")}
          footer={<Button title={tr("Continue")} disabled={!name.trim()} onPress={() => go("use")} />}
        >
          <TextField label={tr("Your name")} placeholder="e.g. Ibrahim" value={name} onChangeText={setName} autoFocus returnKeyType="next" />
          <TextField label={tr("What do you do?")} placeholder="e.g. Accountant at a design studio" value={job} onChangeText={setJob} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {jobs.map((j) => (
              <Chip key={j} label={j} selected={job === j} onPress={() => setJob(job === j ? "" : j)} />
            ))}
          </View>
        </StepShell>
      )}
      {step === "use" && (
        <StepShell key="use" title={tr("How will you use Fino?")} subtitle={tr("We'll set up a starter team for you. You can change it anytime.")}>
          <ChoiceCard
            icon="home-outline"
            title={tr("Personal")}
            detail={tr("Email, calendar and research help for your own life.")}
            selected={use === "personal"}
            delay={60}
            onPress={() => {
              setUse("personal");
              setTeam(null);
              choosePack("personal");
              setTimeout(() => go("pick"), 160);
            }}
          />
          <ChoiceCard
            icon="briefcase-outline"
            title={tr("Work")}
            detail={tr("A team of specialists for your department.")}
            selected={use === "work"}
            delay={120}
            onPress={() => {
              setUse("work");
              setTimeout(() => go("team"), 160);
            }}
          />
        </StepShell>
      )}
      {step === "team" && (
        <StepShell key="team" title={tr("Which team are you on?")} subtitle={tr("We'll pick bots that already know the job.")}>
          {teams.map((t, i) => (
            <ChoiceCard
              key={t.id}
              icon={t.icon}
              title={tr(t.label)}
              detail={t.detail}
              selected={team === t.id}
              delay={60 + i * 60}
              onPress={() => {
                setTeam(t.id);
                choosePack(t.id);
                setTimeout(() => go("pick"), 160);
              }}
            />
          ))}
        </StepShell>
      )}
      {step === "pick" && (
        <StepShell
          key="pick"
          title={tr("Meet your team")}
          subtitle={tr("Each bot comes with ready-made skills. Turn off any you don't need.")}
          footer={<Button title={picked.length ? tr("Create my team · {n}", { n: picked.length + 1 }) : tr("Continue with Quinn only")} onPress={() => go("build")} />}
        >
          {primary && (
            <FadeIn style={[s.card, s.row]}>
              <Avatar shape={primary.avatarShape} size={46} primary />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.headline, { color: p.text }]}>{primary.name}</Text>
                <Text style={[type.footnote, { color: p.muted }]}>{tr("Chief of Staff · coordinates everyone")}</Text>
              </View>
              <Text style={[type.caption, { color: p.faint }]}>{tr("Included")}</Text>
            </FadeIn>
          )}
          {(use === "personal" ? starterTeams.personal : starterTeams[team ?? "other"]).map((id, i) => {
            const t = templateById(id)!;
            return (
              <FadeIn key={id} delay={80 + i * 70}>
                <TemplateToggle
                  t={t}
                  on={picked.includes(id)}
                  installed={isInstalled(t, bots)}
                  onToggle={() => setPicked((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]))}
                />
              </FadeIn>
            );
          })}
          <Text style={[type.footnote, { color: p.faint, textAlign: "center", marginTop: space.sm }]}>
            {catalog.length}+ more bots are waiting in the Marketplace.
          </Text>
        </StepShell>
      )}
      {step === "build" && (
        <Build
          templates={picked.map((id) => templateById(id)!)}
          onFinish={async () => {
            await rememberProfile(primary, { name: name.trim(), job: job.trim(), use: use ?? "personal", team: teams.find((t) => t.id === team)?.label });
            await markOnboarded(user);
            done();
          }}
        />
      )}
    </KeyboardScreen>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const float = useLoop(3600);
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingHorizontal: space.xxl, paddingBottom: insets.bottom + space.lg }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.xxl }}>
        <FadeIn>
          <View style={{ flexDirection: "row" }}>
            {fruits.slice(0, 4).map((f, i) => (
              <Animated.View
                key={f}
                style={{
                  marginLeft: i ? -12 : 0,
                  zIndex: i === 1 || i === 2 ? 2 : 1,
                  transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [0, -10] : [-10, 0] }) }, { scale: i === 1 || i === 2 ? 1.12 : 0.9 }],
                }}
              >
                <Avatar shape={f} size={80} />
              </Animated.View>
            ))}
          </View>
        </FadeIn>
        <FadeIn delay={120} style={{ alignItems: "center", gap: space.md }}>
          <Text style={[type.largeTitle, { color: p.text, textAlign: "center" }]}>Your AI team{"\n"}is almost ready</Text>
          <Text style={[type.body, { color: p.muted, textAlign: "center", maxWidth: 300 }]}>
            {tr("Answer three quick questions and we'll hire the right bots for you, each with its own skills and computer.")}
          </Text>
        </FadeIn>
      </View>
      <FadeIn delay={260}>
        <Button title={tr("Get started")} icon="arrow-forward" onPress={onNext} />
      </FadeIn>
    </View>
  );
}

function StepShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xxl, gap: space.md }} keyboardShouldPersistTaps="handled">
        <FadeIn offset={14} style={{ gap: space.sm, marginBottom: space.md }}>
          <Text style={[type.largeTitle, { color: p.text }]}>{title}</Text>
          {!!subtitle && <Text style={[type.body, { color: p.muted }]}>{subtitle}</Text>}
        </FadeIn>
        <FadeIn delay={80} offset={14} style={{ gap: space.md }}>
          {children}
        </FadeIn>
      </ScrollView>
      {footer && <View style={{ paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: Math.max(insets.bottom, space.lg) }}>{footer}</View>}
    </View>
  );
}

function ChoiceCard({
  icon,
  title,
  detail,
  selected,
  onPress,
  delay = 0,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
  delay?: number;
}) {
  return (
    <FadeIn delay={delay}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={({ pressed }) => [
          s.row,
          {
            padding: space.lg,
            gap: space.lg,
            borderRadius: radius.lg,
            backgroundColor: pressed ? p.raised : p.surface,
            borderWidth: 1.5,
            borderColor: selected ? p.text : p.line,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          },
        ]}
      >
        <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: selected ? p.text : p.raised, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={22} color={selected ? p.onPrimary : p.text} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[type.headline, { color: p.text }]}>{title}</Text>
          <Text style={[type.subhead, { color: p.muted }]}>{detail}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={p.faint} style={mirror("chevron-forward")} />
      </Pressable>
    </FadeIn>
  );
}

export function TemplateToggle({ t, on, installed, onToggle }: { t: BotTemplate; on: boolean; installed: boolean; onToggle: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on || installed, disabled: installed }}
      disabled={installed}
      onPress={() => {
        void Haptics.selectionAsync();
        onToggle();
      }}
      style={({ pressed }) => [s.card, { backgroundColor: pressed ? p.raised : p.surface, borderColor: on ? p.lineStrong : p.line, gap: space.md }]}
    >
      <View style={s.row}>
        <Avatar shape={t.shape} size={46} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.headline, { color: p.text }]}>
            {t.name} <Text style={{ color: p.muted, fontWeight: "400" }}>· {tr(t.label)}</Text>
          </Text>
          <Text style={[type.footnote, { color: p.muted }]} numberOfLines={2}>
            {tr(t.description)}
          </Text>
        </View>
        {installed ? (
          <Text style={[type.caption, { color: p.faint }]}>{tr("On team")}</Text>
        ) : (
          <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={26} color={on ? p.text : p.faint} />
        )}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {t.skills.map((sk) => (
          <View key={sk.name} style={[s.row, { gap: 4, backgroundColor: p.raised, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 4 }]}>
            <Ionicons name="flash" size={10} color={p.amber} />
            <Text style={[type.caption, { color: p.muted, fontWeight: "500" }]}>{sk.name}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

type RowState = { phase: "waiting" | "working" | "done" | "error"; skills: number };
function Build({ templates, onFinish }: { templates: BotTemplate[]; onFinish: () => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<RowState[]>(() => templates.map(() => ({ phase: "waiting", skills: 0 })));
  const [finished, setFinished] = useState(false),
    [error, setError] = useState<string | null>(null),
    [closing, setClosing] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < templates.length; i++) {
        if (cancelled) return;
        setRows((old) => old.map((r, j) => (j === i ? { ...r, phase: "working" } : r)));
        try {
          await installTemplate(templates[i], (n) => setRows((old) => old.map((r, j) => (j === i ? { ...r, skills: n } : r))));
          setRows((old) => old.map((r, j) => (j === i ? { ...r, phase: "done" } : r)));
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch (e) {
          setRows((old) => old.map((r, j) => (j === i ? { ...r, phase: "error" } : r)));
          setError((e as Error).message);
        }
      }
      await useWorkspace.getState().refresh().catch(() => {});
      if (cancelled) return;
      setFinished(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 160 }).start();
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.md }}>
        <View style={{ alignItems: "center", gap: space.md, paddingVertical: space.lg }}>
          {finished ? (
            <Animated.View style={{ transform: [{ scale: pop }], width: 72, height: 72, borderRadius: 36, backgroundColor: p.text, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="checkmark" size={38} color={p.onPrimary} />
            </Animated.View>
          ) : (
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: p.raised, alignItems: "center", justifyContent: "center" }}>
              <TypingDots color={p.text} size={7} />
            </View>
          )}
          <Text style={[type.largeTitle, { color: p.text, textAlign: "center" }]}>{finished ? tr("Your team is ready") : tr("Hiring your team…")}</Text>
          <Text style={[type.body, { color: p.muted, textAlign: "center" }]}>
            {finished ? tr("Say hi to Quinn. It already knows who you are and who's on the team.") : tr("Setting up each bot with its skills.")}
          </Text>
        </View>
        {templates.map((t, i) => {
          const r = rows[i];
          return (
            <FadeIn key={t.id} delay={i * 90} style={[s.card, s.row, { opacity: r.phase === "waiting" ? 0.5 : 1 }]}>
              <Avatar shape={t.shape} size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.headline, { color: p.text }]}>{t.name}</Text>
                <Text style={[type.footnote, { color: r.phase === "error" ? p.red : p.muted }]}>
                  {r.phase === "waiting"
                    ? tr(t.label)
                    : r.phase === "error"
                      ? tr("Couldn't add this bot")
                      : r.phase === "done"
                        ? n(t.skills.length, "{n} skill ready", "{n} skills ready")
                        : tr("Adding skills {n}/{total}", { n: r.skills, total: t.skills.length })}
                </Text>
              </View>
              {r.phase === "done" ? (
                <Ionicons name="checkmark-circle" size={24} color={p.green} />
              ) : r.phase === "working" ? (
                <TypingDots color={p.muted} size={4} />
              ) : r.phase === "error" ? (
                <Ionicons name="alert-circle" size={24} color={p.red} />
              ) : null}
            </FadeIn>
          );
        })}
        <ErrorText error={error} />
      </ScrollView>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: Math.max(insets.bottom, space.lg) }}>
        <Button
          title={finished ? tr("Start") : tr("Setting up…")}
          icon={finished ? "arrow-forward" : undefined}
          busy={closing}
          disabled={!finished}
          onPress={() => {
            setClosing(true);
            void onFinish().finally(() => setClosing(false));
          }}
        />
      </View>
    </View>
  );
}
