import { useEffect, useState } from "react";
import {
  Users,
  Copy,
  LogOut,
  ShieldCheck,
  ChevronRight,
  Download,
  Leaf,
  KeyRound,
  Heart,
  Plus,
  X,
} from "lucide-react";
import type { Preferences } from "@fridge/shared";
import { api, type Me, type Family, type Member } from "./api";
import { Button, Sheet, AsyncForm, Field, notify, confirm } from "./components";

export function Settings({
  me,
  family,
  refresh,
  logout,
  createFamily,
  install,
}: {
  me: Me;
  family: Family;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  createFamily: () => void;
  install: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invite, setInvite] = useState("");
  const [prefs, setPrefs] = useState<Preferences>(family.preferences);
  const [seasons, setSeasons] = useState(prefs.seasonings.join("，"));
  const [avoid, setAvoid] = useState(prefs.avoid.join("，"));
  const [password, setPassword] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const loadMembers = async () => {
    try {
      setMembers(await api("/members"));
    } catch (e) {
      notify((e as Error).message);
    }
  };
  useEffect(() => {
    void loadMembers();
  }, [family.id]);
  async function inviteMember() {
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/invites", {
        method: "POST",
        body: {},
      });
      setInvite(r.url);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">HOME IS WHERE THE FOOD IS</div>
          <h1>
            我的小家<span className="heading-dot">.</span>
          </h1>
          <p>和在意的人，一起把日子过得有滋有味。</p>
        </div>
      </div>
      <div className="settings-layout">
        <div>
          <section className="profile-card">
            <span className="avatar">
              {me.username.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h2>{me.username}</h2>
              <p>
                {family.name} ·{" "}
                {family.role === "admin" ? "家庭管理员" : "家庭成员"}
              </p>
            </div>
            <span className="profile-leaf">🌿</span>
          </section>
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>
                  <Users size={19} />
                  家庭成员
                </h2>
                <span>{members.length}/5 位成员 · 一个冰箱，一起打理</span>
              </div>
              {family.role === "admin" && (
                <Button secondary loading={busy} onClick={inviteMember}>
                  <Plus size={16} />
                  邀请
                </Button>
              )}
            </div>
            {members.map((m) => (
              <div className="member-row" key={m.userId}>
                <span className="small-avatar">
                  {m.user.username.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <b>
                    {m.user.username}
                    {m.userId === me.id && <small>（我）</small>}
                  </b>
                  <p>{m.role === "admin" ? "管理员" : "家庭成员"}</p>
                </div>
                {(family.role === "admin" || m.userId === me.id) &&
                  m.role !== "admin" && (
                    <button
                      className="quiet-button warning"
                      onClick={async () => {
                        if (
                          !(await confirm(
                            m.userId === me.id
                              ? "确认退出家庭？退出后将无法访问这个家庭的库存和记录。"
                              : `确认移除 ${m.user.username}？对方将立即失去家庭访问权限。`,
                          ))
                        )
                          return;
                        try {
                          await api(`/members/${m.userId}`, {
                            method: "DELETE",
                          });
                          await loadMembers();
                          await refresh();
                        } catch (e) {
                          notify((e as Error).message);
                        }
                      }}
                    >
                      {m.userId === me.id ? "退出家庭" : "移除"}
                    </button>
                  )}
              </div>
            ))}
            {invite && (
              <div className="invite-box">
                <b>邀请家人一起加入</b>
                <p>24 小时内有效，仅可使用一次。</p>
                <input readOnly aria-label="家庭邀请链接" value={invite} />
                <Button
                  secondary
                  className="full"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(invite);
                      notify("邀请链接已复制");
                    } catch {
                      notify("请长按上方链接复制");
                    }
                  }}
                >
                  <Copy size={16} />
                  复制邀请链接
                </Button>
              </div>
            )}
          </section>
          <section className="panel">
            <h3>让每次推荐，更懂你们</h3>
            <AsyncForm
              label="保存家庭偏好"
              onSuccess={async () => {
                await refresh();
                notify("偏好已保存");
              }}
              submit={() =>
                api("/preferences", {
                  method: "PUT",
                  body: {
                    ...prefs,
                    seasonings: seasons
                      .split(/[，,]/)
                      .map((v) => v.trim())
                      .filter(Boolean),
                    avoid: avoid
                      .split(/[，,]/)
                      .map((v) => v.trim())
                      .filter(Boolean),
                  },
                })
              }
            >
              <Field
                label="常备调料"
                hint="默认用于菜谱推荐。需要记录消耗的调料，请作为普通食材入库。"
              >
                <input
                  disabled={family.role !== "admin"}
                  value={seasons}
                  onChange={(e) => setSeasons(e.target.value)}
                />
              </Field>
              <Field
                label="家庭忌口 / 过敏原"
                hint="多个词用逗号分隔。请在食用前再次核对 AI 建议。"
              >
                <input
                  disabled={family.role !== "admin"}
                  value={avoid}
                  onChange={(e) => setAvoid(e.target.value)}
                />
              </Field>
              <Field label="喜欢的口味">
                <input
                  disabled={family.role !== "admin"}
                  maxLength={100}
                  value={prefs.taste}
                  onChange={(e) =>
                    setPrefs({ ...prefs, taste: e.target.value })
                  }
                />
              </Field>
              <Field label="提前几天提醒临期">
                <select
                  disabled={family.role !== "admin"}
                  value={prefs.expiringDays}
                  onChange={(e) =>
                    setPrefs({ ...prefs, expiringDays: Number(e.target.value) })
                  }
                >
                  {[0, 1, 2, 3, 5, 7, 14, 30].map((n) => (
                    <option key={n} value={n}>
                      {n} 天
                    </option>
                  ))}
                </select>
              </Field>
              {family.role !== "admin" && (
                <p className="muted">家庭偏好由管理员维护。</p>
              )}
            </AsyncForm>
          </section>
        </div>
        <aside>
          <section className="panel settings-links">
            <h3>账号与应用</h3>
            <button onClick={createFamily}>
              <Plus size={19} />
              创建另一个家庭
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setPassword(true)}>
              <KeyRound size={19} />
              修改密码
              <ChevronRight size={16} />
            </button>
            <button onClick={install}>
              <Download size={19} />
              添加到手机桌面
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setPrivacy(true)}>
              <ShieldCheck size={19} />
              隐私与数据说明
              <ChevronRight size={16} />
            </button>
            <button
              onClick={async () => {
                if (await confirm("确认退出登录？")) await logout();
              }}
            >
              <LogOut size={19} />
              退出登录
              <ChevronRight size={16} />
            </button>
          </section>
          <div className="settings-note">
            <Leaf size={24} />
            <h3>好好吃饭，好好生活。</h3>
            <p>
              家庭数据保存在云端。导出、删除或账号维护，请联系家庭管理员，按部署文档中的维护流程操作。
            </p>
            <small>冰箱管家 1.0.0</small>
          </div>
        </aside>
      </div>
      {password && (
        <Sheet title="修改密码" close={() => setPassword(false)}>
          <AsyncForm
            label="修改并重新登录"
            submit={() =>
              api("/password", {
                method: "POST",
                body: { current, password: next },
              })
            }
            onSuccess={logout}
          >
            <Field label="当前密码">
              <input
                required
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
            <Field label="新密码（至少 10 位）">
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </Field>
          </AsyncForm>
        </Sheet>
      )}
      {privacy && (
        <Sheet title="隐私与数据说明" close={() => setPrivacy(false)}>
          <Privacy />
        </Sheet>
      )}
    </>
  );
}
export function Privacy() {
  const [contact, setContact] = useState("请联系家庭管理员");
  useEffect(() => {
    api<{ contact: string }>("/privacy")
      .then((r) => setContact(r.contact))
      .catch(() => {});
  }, []);
  return (
    <div className="prose">
      <p>
        本应用为邀请制家庭冰箱管理工具，保存账号名称、密码哈希、家庭关系、食材批次、出入库流水和做菜记录。密码不会以明文保存。
      </p>
      <p>
        这些业务数据保存在部署方的服务器数据库中，家庭成员只能访问所属家庭的数据。账号退出后，页面会清除当前家庭的显示内容。应用离线时仅提供静态外壳，不缓存业务接口响应。
      </p>
      <p>
        使用 AI
        推荐时，会向配置的模型服务商发送可用食材名称、标识、单位、数量、人数、口味、忌口及常备调料；不发送密码、会话或邀请链接。请避免在备注、偏好中填写与烹饪无关的个人信息。
      </p>
      <p>
        库存、做菜记录及审计流水持续保留，直至管理员按维护流程删除家庭。模型调用结果及用量日志供限额、排错和短时复用。备份按部署设置轮换：7
        份日备份、4 份周备份；删除在线数据后，备份中的数据会在轮换期限内到期。
      </p>
      <p>
        到期日期仅作管理参考，系统和 AI
        不判断食材安全，也不保证过敏原识别完整。请根据实际情况核对并决定是否食用。
      </p>
      <p>导出、更正、删除数据和隐私事宜：{contact}。</p>
      <small>更新日期：2026 年 10 月 20 日</small>
    </div>
  );
}
