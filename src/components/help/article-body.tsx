/** Minimal rich text for help articles: paragraphs, "- " / "1. " lists, "## " subheadings, **bold**. */
export function ArticleBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  return (
    <div className="space-y-4 text-[15px] leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (b.startsWith("## ")) return <h2 key={i} className="pt-2 text-lg font-extrabold">{b.slice(3)}</h2>;
        if (lines.every((l) => /^(- |\d+\. )/.test(l))) {
          const ordered = /^\d+\. /.test(lines[0]);
          const items = lines.map((l, j) => <li key={j}>{inline(l.replace(/^(- |\d+\. )/, ""))}</li>);
          return ordered ? <ol key={i} className="list-decimal space-y-1 pl-6">{items}</ol> : <ul key={i} className="list-disc space-y-1 pl-6">{items}</ul>;
        }
        return <p key={i}>{inline(b)}</p>;
      })}
    </div>
  );
}
