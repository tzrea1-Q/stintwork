// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
export function Toaster(props: ToasterProps) {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light"),
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return (
    <Sonner
      {...props}
      theme={theme}
      toastOptions={{
        ...props.toastOptions,
        classNames: {
          toast: "!rounded-2xl !border-border !bg-popover !text-popover-foreground !shadow-overlay",
          ...props.toastOptions?.classNames,
        },
      }}
    />
  );
}
