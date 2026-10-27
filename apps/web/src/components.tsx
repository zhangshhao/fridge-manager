import {
  useState,
  useId,
  Children,
  isValidElement,
  cloneElement,
  type ReactNode,
  type FormEvent,
} from "react";
import { Popup, Toast, Dialog } from "antd-mobile";
import { X, ArrowRight, LoaderCircle } from "lucide-react";
export function Button({
  children,
  secondary = false,
  danger = false,
  loading = false,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  secondary?: boolean;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`button ${secondary ? "secondary" : ""} ${danger ? "danger" : ""} ${className}`}
    >
      {loading && <LoaderCircle size={17} className="spin" />}
      {children}
    </button>
  );
}
export function Sheet({
  title,
  children,
  close,
  wide = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
  className?: string;
}) {
  return (
    <Popup
      visible
      onMaskClick={close}
      position="bottom"
      bodyClassName={`sheet ${wide ? "wide" : ""} ${className}`}
      destroyOnClose
    >
      <div role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button aria-label="关闭" className="icon-button" onClick={close}>
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </Popup>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child) =>
        isValidElement(child) &&
        ["input", "select", "textarea"].includes(String(child.type))
          ? cloneElement(child as React.ReactElement<{ id?: string }>, { id })
          : child,
      )}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="error-box" role="alert">
      {error}
    </div>
  ) : null;
}
export function Empty({
  icon = "🌱",
  title,
  children,
}: {
  icon?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-emoji">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function AsyncForm({
  children,
  submit,
  label,
  onSuccess,
}: {
  children: ReactNode;
  submit: () => Promise<unknown>;
  label: string;
  onSuccess?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await submit();
      await onSuccess?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      {children}
      <ErrorBox error={error} />
      <Button type="submit" loading={busy} className="full">
        {label}
        <ArrowRight size={17} />
      </Button>
    </form>
  );
}
export const notify = (content: string) =>
  Toast.show({ content, duration: 2200 });
export const confirm = (content: string) =>
  Dialog.confirm({ content, confirmText: "确认", cancelText: "取消" });
