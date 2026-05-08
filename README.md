# AEM Coder Skills

Installable skill packages for [Slicc](https://github.com/ai-ecoverse/slicc).

## Migration Skills

Migrate web pages to AEM Edge Delivery Services. Extracts page structure,
decomposes into blocks, generates EDS-compatible code per block, and
verifies with visual comparison.

### Installation

```
upskill aemcoder/skills --path skills/migration --all
```

Or install individual skills:

```
upskill aemcoder/skills --path skills/migration --skill migrate-page
upskill aemcoder/skills --path skills/migration --skill migrate-block
```

### Usage

After installation, prompt the cone with a URL and GitHub repo:

```
Migrate https://www.example.com/page to owner/eds-repo
```

The `migrate-page` skill activates and orchestrates the full flow.

### Skills

| Skill | Purpose |
|-------|---------|
| `migrate-page` | Cone orchestration: extraction, decomposition, parallel block generation, assembly |
| `migrate-block` | Per-block scoop skill: content extraction, CSS/JS, preview, visual verification |
| `migrate-header` | Header/nav scoop skill: nav.plain.html, multi-section headers, dropdowns |
| `dismiss-overlays` | Reference: cookie banners, GDPR consent, chat widget dismissal patterns |

### Requirements

- Slicc instance with browser, bash, read_file, write_file, javascript tools
- GitHub access for `git clone` (public repos or configured token)
- Scoop system for parallel block generation

## License

See [LICENSE](LICENSE).
