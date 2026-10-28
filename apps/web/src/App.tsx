import { useCallback, useEffect, useRef, useState } from "react";
import { ConfigProvider } from "antd-mobile";
import zhCN from "antd-mobile/es/locales/zh-CN";
import {
  Refrigerator,
  Sparkles,
  CalendarDays,
  UserRound,
  ChevronDown,
  Leaf,
  WifiOff,
  RefreshCw,
  ArrowRight,
  Menu,
  X,
  Download,
  LoaderCircle,
} from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  api,
  setApiFamily,
  localDate,
  type Family,
  type Ingredient,
  type Meal,
  type Me,
  ApiError,
} from "./api";
import {
  Button,
  AsyncForm,
  Field,
  ErrorBox,
  Sheet,
  notify,
  confirm,
} from "./components";
import { Stock } from "./Stock";
import { Recipes } from "./Recipes";
import { MealCalendar, MealEditor, newDraft, type Draft } from "./Meals";
import { Settings, Privacy } from "./Settings";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const navigation = [
  { key: "stock", title: "我的冰箱", mobile: "冰箱", icon: Refrigerator },
  { key: "recipes", title: "今天吃什么", mobile: "今天吃什么", icon: Sparkles },
  { key: "meals", title: "做菜记录", mobile: "做菜记录", icon: CalendarDays },
  { key: "settings", title: "我的小家", mobile: "我的", icon: UserRound },
];
export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [pendingInvite, setPendingInvite] = useState(
    new URLSearchParams(location.search).has("invite"),
  );
  const [items, setItems] = useState<Ingredient[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [tab, setTab] = useState("stock");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [install, setInstall] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [createFamily, setCreateFamily] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState("");
  const [familyMenu, setFamilyMenu] = useState(false);
  const requestGeneration = useRef(0);
  const activeFamily = me?.families.find((f) => f.id === familyId);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ onRegisterError: () => {} });
  const updateDirty = (v: boolean) => {
    dirtyRef.current = v;
    setDirty(v);
  };
  const loadData = useCallback(async (id: string) => {
    const generation = ++requestGeneration.current;
    setApiFamily(id);
    const [inventory, records] = await Promise.all([
      api<Ingredient[]>("/inventory"),
      api<Meal[]>("/meals"),
    ]);
    if (generation === requestGeneration.current) {
      setItems(inventory);
      setMeals(records);
    }
  }, []);
  const loadMe = useCallback(async () => {
    const u = await api<Me>("/me");
    setMe(u);
    return u;
  }, []);
  async function init() {
    setLoading(true);
    setError("");
    try {
      const u = await loadMe();
      const id = u.families[0]?.id || "";
      setFamilyId(id);
      if (id) await loadData(id);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void init();
    const handleOnline = () => setOnline(navigator.onLine);
    const sessionExpired = () => {
      requestGeneration.current++;
      setMe(null);
      setItems([]);
      setMeals([]);
      setDraft(null);
      updateDirty(false);
      setApiFamily("");
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    const captureInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOnline);
    window.addEventListener("session-expired", sessionExpired);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("beforeinstallprompt", captureInstall);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOnline);
      window.removeEventListener("session-expired", sessionExpired);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("beforeinstallprompt", captureInstall);
    };
  }, []);
  const refresh = async () => {
    try {
      const u = await loadMe();
      if (!u.families.some((f) => f.id === familyId)) {
        const next = u.families[0]?.id || "";
        setFamilyId(next);
        if (next) await loadData(next);
        else {
          setItems([]);
          setMeals([]);
        }
      } else await loadData(familyId);
    } catch (e) {
      notify(`暂时无法刷新列表：${(e as Error).message}`);
    }
  };
  async function logout() {
    await api("/logout", { method: "POST", body: {} });
    requestGeneration.current++;
    setMe(null);
    setItems([]);
    setMeals([]);
    setFamilyId("");
    setApiFamily("");
    setDraft(null);
    updateDirty(false);
  }
  async function navigate(next: string) {
    if (dirtyRef.current && !(await confirm("当前内容尚未保存，确认离开？")))
      return;
    updateDirty(false);
    setDraft(null);
    setTab(next);
    window.scrollTo({ top: 0 });
  }
  function startDraft(d: Draft) {
    setDraft(d);
    updateDirty(true);
    window.scrollTo({ top: 0 });
  }
  const month = localDate().slice(0, 7);
  if (loading)
    return (
      <div className="loading-screen">
        <div className="brand-mark">
          <Refrigerator size={30} />
        </div>
        <h2>冰箱管家</h2>
        <p>
          <LoaderCircle className="spin" size={17} />
          正在打开新鲜生活…
        </p>
      </div>
    );
  return (
    <ConfigProvider locale={zhCN}>
      <div className="app">
        {!online && (
          <div className="offline-bar">
            <WifiOff size={16} />
            当前离线，请联网后查看和保存最新数据。
          </div>
        )}
        {needRefresh && (
          <div className="update-bar">
            <RefreshCw size={15} />
            {dirty ? "新版本已就绪，完成当前填写后可更新" : "有新版本可用"}
            <button
              disabled={dirty}
              onClick={() => void updateServiceWorker(true)}
            >
              更新应用
            </button>
          </div>
        )}
        {!me || pendingInvite ? (
          <Login
            loggedIn={async () => {
              setPendingInvite(false);
              await init();
            }}
            initialError={error}
          />
        ) : !activeFamily ? (
          <div className="no-family">
            <div className="brand-mark">
              <Refrigerator size={30} />
            </div>
            <h1>给新鲜找个家</h1>
            <p>你还未加入家庭。可以创建家庭，或让家人发送邀请链接。</p>
            <Button onClick={() => setCreateFamily(true)}>
              创建我的家庭 <ArrowRight size={17} />
            </Button>
            <button className="text-link centered" onClick={logout}>
              退出登录
            </button>
          </div>
        ) : (
          <>
            <aside className="sidebar">
              <a
                className="brand"
                href={import.meta.env.BASE_URL}
                onClick={(e) => {
                  e.preventDefault();
                  void navigate("stock");
                }}
              >
                <span className="brand-mark">
                  <Refrigerator size={25} />
                </span>
                <span>
                  <b>冰箱管家</b>
                  <small>YOUR LITTLE KITCHEN</small>
                </span>
              </a>
              <div className="nav-label">日常的小美好</div>
              <nav>
                {navigation.map((n) => (
                  <button
                    key={n.key}
                    className={tab === n.key ? "active" : ""}
                    onClick={() => void navigate(n.key)}
                  >
                    <n.icon size={20} />
                    {n.title}
                    {tab === n.key && <i />}
                  </button>
                ))}
              </nav>
              <div className="sidebar-bottom">
                <div className="sidebar-note">
                  <span>🌱</span>
                  <b>每一份新鲜，都值得珍惜。</b>
                  <p>
                    从管理冰箱开始，
                    <br />
                    把生活过得井井有条。
                  </p>
                </div>
                <button
                  className="install-link"
                  onClick={() => setInstall(true)}
                >
                  <Download size={16} />
                  添加到桌面
                  <ArrowRight size={15} />
                </button>
                <small className="sidebar-version">冰箱管家 · v1.0.0</small>
              </div>
            </aside>
            <div className="main-shell">
              <header className="topbar">
                <div className="mobile-brand">
                  <Refrigerator size={21} />
                  <b>冰箱管家</b>
                </div>
                <div className="breadcrumb">
                  我们的厨房 <span>/</span>{" "}
                  {navigation.find((n) => n.key === tab)?.title}
                </div>
                <div className="topbar-right">
                  <span className="today-date">
                    {new Intl.DateTimeFormat("zh-CN", {
                      timeZone: "Asia/Shanghai",
                      month: "long",
                      day: "numeric",
                      weekday: "long",
                    }).format(new Date())}
                  </span>
                  <span className="topbar-divider" />
                  <div className="family-switch">
                    <button onClick={() => setFamilyMenu(!familyMenu)}>
                      <span className="tiny-home">⌂</span>
                      {activeFamily.name}
                      <ChevronDown size={14} />
                    </button>
                    {familyMenu && (
                      <div className="family-menu">
                        {me.families.map((f) => (
                          <button
                            key={f.id}
                            onClick={async () => {
                              setFamilyMenu(false);
                              if (
                                dirtyRef.current &&
                                !(await confirm(
                                  "切换家庭会放弃未保存内容，确认切换？",
                                ))
                              )
                                return;
                              updateDirty(false);
                              setDraft(null);
                              setItems([]);
                              setMeals([]);
                              setFamilyId(f.id);
                              try {
                                await loadData(f.id);
                              } catch (e) {
                                notify((e as Error).message);
                              }
                            }}
                          >
                            {f.name}
                            {f.id === familyId && " ✓"}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            setFamilyMenu(false);
                            setCreateFamily(true);
                          }}
                        >
                          ＋ 创建家庭
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    className="topbar-avatar"
                    aria-label="我的账号"
                    onClick={() => void navigate("settings")}
                  >
                    {me.username.slice(0, 1).toUpperCase()}
                  </button>
                </div>
              </header>
              <main className="main-content" key={familyId}>
                {draft ? (
                  <MealEditor
                    initial={draft}
                    items={items}
                    dirty={updateDirty}
                    close={() => setDraft(null)}
                    saved={refresh}
                  />
                ) : (
                  <>
                    {tab === "stock" && (
                      <Stock
                        items={items}
                        family={activeFamily}
                        mealCount={
                          meals.filter(
                            (m) =>
                              m.date.startsWith(month) && m.status === "active",
                          ).length
                        }
                        refresh={refresh}
                        dirty={updateDirty}
                      />
                    )}
                    {tab === "recipes" && (
                      <Recipes
                        family={activeFamily}
                        items={items}
                        manual={() => startDraft(newDraft())}
                        cook={startDraft}
                      />
                    )}
                    {tab === "meals" && (
                      <MealCalendar
                        meals={meals}
                        me={me}
                        family={activeFamily}
                        refresh={refresh}
                        create={() => startDraft(newDraft())}
                        edit={(m) => startDraft(m)}
                        repeat={(m) => {
                          const { id: _, revision: __, ...copy } = m;
                          startDraft({ ...copy, date: localDate() });
                        }}
                      />
                    )}
                    {tab === "settings" && (
                      <Settings
                        me={me}
                        family={activeFamily}
                        refresh={refresh}
                        logout={logout}
                        createFamily={() => setCreateFamily(true)}
                        install={() => setInstall(true)}
                      />
                    )}
                  </>
                )}
              </main>
              <footer className="page-footer">
                <span>好好吃饭，从冰箱开始。</span>
                <span>
                  <span className="live-dot" /> {online ? "已连接" : "离线"} ·
                  Asia/Shanghai
                </span>
              </footer>
            </div>
            <nav className="bottom-nav">
              {navigation.map((n) => (
                <button
                  key={n.key}
                  className={tab === n.key ? "active" : ""}
                  onClick={() => void navigate(n.key)}
                >
                  <n.icon size={21} />
                  <span>{n.mobile}</span>
                </button>
              ))}
            </nav>
          </>
        )}
        {install && (
          <Sheet title="把新鲜生活放到桌面" close={() => setInstall(false)}>
            <div className="install-hero">
              <span className="brand-mark">
                <Refrigerator size={30} />
              </span>
              <h3>打开就能看看冰箱</h3>
              <p>无需应用商店，像打开应用一样管理食材。</p>
            </div>
            {installEvent && (
              <Button
                className="full"
                onClick={async () => {
                  await installEvent.prompt();
                  await installEvent.userChoice;
                  setInstallEvent(null);
                }}
              >
                安装冰箱管家
              </Button>
            )}
            <div className="prose">
              <h3>iPhone · Safari</h3>
              <p>
                用 Safari
                打开网站，点底部“分享”，选择“添加到主屏幕”，再点“添加”。
              </p>
              <h3>安卓 · Chrome / Edge</h3>
              <p>
                打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。支持时也可使用上方安装按钮。
              </p>
              <p className="small-note">
                手机安装需要有效 HTTPS
                地址。当前本机开发地址用于功能验收；局域网 HTTP
                不能完成正式安装验收。
              </p>
            </div>
          </Sheet>
        )}
        {createFamily && (
          <Sheet title="创建我们的家" close={() => setCreateFamily(false)}>
            <AsyncForm
              label="创建家庭"
              submit={() =>
                api("/families", {
                  method: "POST",
                  body: { name: newFamilyName },
                })
              }
              onSuccess={async () => {
                setCreateFamily(false);
                await init();
              }}
            >
              <Field label="家庭名称">
                <input
                  autoFocus
                  required
                  maxLength={40}
                  value={newFamilyName}
                  onChange={(e) => setNewFamilyName(e.target.value)}
                  placeholder="例如：幸福小家"
                />
              </Field>
            </AsyncForm>
          </Sheet>
        )}
      </div>
    </ConfigProvider>
  );
}
function Login({
  loggedIn,
  initialError,
}: {
  loggedIn: () => Promise<void>;
  initialError: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState(
    new URLSearchParams(location.search).get("invite") || "",
  );
  const [privacy, setPrivacy] = useState(false);
  const [register, setRegister] = useState(false);
  return (
    <div className="login-page">
      <div className="login-story">
        <a className="brand">
          <span className="brand-mark">
            <Refrigerator size={28} />
          </span>
          <span>
            <b>冰箱管家</b>
            <small>YOUR LITTLE KITCHEN</small>
          </span>
        </a>
        <div>
          <span className="eyebrow">A LITTLE FRESHNESS, EVERY DAY</span>
          <h1>
            冰箱里是食材，
            <br />
            也是认真生活的心意。
          </h1>
          <p>
            存好每一份新鲜，安排每一顿家常。
            <br />
            和家人一起，让厨房里的小日子更有滋味。
          </p>
          <div className="login-food">
            🥬 <span>🍅</span> 🥚
          </div>
        </div>
        <small>少一点浪费，多一点美味。</small>
      </div>
      <div className="login-form-wrap">
        <div className="login-form">
          <span className="login-greeting">👋　欢迎回到厨房</span>
          <h2>{invite ? "加入家人的冰箱" : "新鲜生活，从这里开始"}</h2>
          <p>
            {invite
              ? "新成员请设置账号；已有账号请填写原用户名和密码。"
              : "登录后，看看冰箱里有什么好吃的。"}
          </p>
          <ErrorBox error={initialError} />
          <AsyncForm
            label={invite ? "接受邀请并加入" : "打开我的冰箱"}
            submit={async () => {
              if (invite) {
                await api("/invites/accept", {
                  method: "POST",
                  body: { username, password, token: invite },
                });
                setInvite("");
                history.replaceState(null, "", "/");
              }
              await api("/login", {
                method: "POST",
                body: { username, password },
              });
            }}
            onSuccess={() => void loggedIn()}
          >
            <Field label="用户名">
              <input
                required
                autoComplete="username"
                minLength={3}
                maxLength={32}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
              />
            </Field>
            <Field label={invite ? "密码（至少 10 位）" : "密码"}>
              <input
                required
                autoComplete={invite ? "new-password" : "current-password"}
                type="password"
                minLength={10}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
              />
            </Field>
          </AsyncForm>
          {!invite && (
            <Button
              secondary
              className="full"
              onClick={() => setRegister(true)}
            >
              注册账号并创建家庭
            </Button>
          )}
          <div className="login-invite-note">
            <ShieldIcon />
            和家人共用一个冰箱
            <br />
            <small>已有家庭？请使用管理员发送的邀请链接加入。</small>
          </div>
          <p className="privacy-link">
            注册或登录即表示你了解
            <button onClick={() => setPrivacy(true)}>隐私与数据说明</button>
          </p>
        </div>
      </div>
      {privacy && (
        <Sheet title="隐私与数据说明" close={() => setPrivacy(false)}>
          <Privacy />
        </Sheet>
      )}
      {register && (
        <Sheet title="注册并创建家庭" close={() => setRegister(false)}>
          <Registration loggedIn={loggedIn} />
        </Sheet>
      )}
    </div>
  );
}
function Registration({ loggedIn }: { loggedIn: () => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [familyName, setFamilyName] = useState("");
  return (
    <>
      <p className="muted">
        注册后直接进入新家庭的冰箱，你将成为家庭管理员，可以邀请家人加入。
      </p>
      <AsyncForm
        label="注册并打开冰箱"
        submit={async () => {
          if (password !== confirmation)
            throw new Error("两次输入的密码不一致");
          await api("/register", {
            method: "POST",
            body: { username, password, familyName },
          });
        }}
        onSuccess={() => void loggedIn()}
      >
        <Field label="用户名" hint="3–32 位字母、数字、下划线或短横线">
          <input
            required
            autoComplete="username"
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9_\-]+"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="给自己取一个用户名"
          />
        </Field>
        <Field label="密码（至少 10 位）">
          <input
            required
            autoComplete="new-password"
            type="password"
            minLength={10}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="设置登录密码"
          />
        </Field>
        <Field label="确认密码">
          <input
            required
            autoComplete="new-password"
            type="password"
            minLength={10}
            maxLength={128}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="再次输入密码"
          />
        </Field>
        <Field label="家庭名称">
          <input
            required
            maxLength={40}
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="例如：我们的家"
          />
        </Field>
      </AsyncForm>
    </>
  );
}
const ShieldIcon = () => <Leaf size={17} />;
