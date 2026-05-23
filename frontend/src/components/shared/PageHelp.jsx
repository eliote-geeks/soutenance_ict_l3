import { useState } from 'react';
import { HelpCircle, X, ChevronRight, Lightbulb, Info, AlertTriangle, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const ICON_MAP = { tip: Lightbulb, info: Info, warning: AlertTriangle };
const COLOR_MAP = {
  tip:     'bg-primary/10 border-primary/20 text-primary',
  info:    'bg-blue-500/10 border-blue-500/20 text-blue-400',
  warning: 'bg-warning/10 border-warning/20 text-warning',
};

export function PageHelp({ title, description, items = [], tips = [] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-5 z-40 w-10 h-10 rounded-full bg-primary/90 text-primary-foreground shadow-lg hover:bg-primary hover:scale-110 transition-all duration-200 flex items-center justify-center"
        title="Page help"
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in panel */}
      <div className={cn(
        "fixed top-0 right-0 h-full w-full max-w-sm z-50 bg-card border-l border-border shadow-2xl flex flex-col transition-transform duration-300 ease-out",
        open ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground">{title}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          )}

          {/* Sections */}
          {items.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How it works</h3>
              {items.map((item, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    {item.desc && <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tips */}
          {tips.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tips</h3>
              {tips.map((tip, i) => {
                const Icon = ICON_MAP[tip.type || 'tip'];
                return (
                  <div key={i} className={cn("flex gap-2.5 p-3 rounded-lg border text-sm", COLOR_MAP[tip.type || 'tip'])}>
                    <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span className="leading-relaxed opacity-90">{tip.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <a
            href="/guide"
            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs text-primary hover:bg-primary/10 transition-colors font-medium"
          >
            Open full user guide
            <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </>
  );
}

export default PageHelp;
