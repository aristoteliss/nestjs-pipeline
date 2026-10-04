---
title: "Αναβάθμιση από την έκδοση 0.3.x"
sidebar:
  order: 1
---

Η έκδοση 0.4.0 δημοσιεύει κάθε πακέτο ως ES module. Το API, οι απαιτήσεις (Node.js 22.12,
NestJS `^12.1.0`) και η συμπεριφορά είναι ίδια με της έκδοσης 0.3.0· το [CHANGELOG.md](/nestjs-pipeline/changelog/) παραθέτει
τις αλλαγές.

**1. ES modules.** Κάθε πακέτο δηλώνει `"type": "module"` και έναν χάρτη `exports`. Μια εφαρμογή ES
module το κάνει import· μια εφαρμογή CommonJS το φορτώνει με `require()`, το οποίο το
Node.js υποστηρίζει από την έκδοση 22.12. Μια εφαρμογή CommonJS που μεταγλωττίζεται με TypeScript
`module: node16` μεταβαίνει σε `nodenext`, `node20` ή `bundler`, όπως ήδη απαιτεί το NestJS 12·
αυτό είναι νέο για εφαρμογές που χρησιμοποιούν μόνο τα πακέτα `@cqrs-ddd/*`.

**2. Μόνο entry points.** Ένα πακέτο επιλύεται μέσω του χάρτη `exports` του: η ρίζα του,
τα `/domain`, `/application`, `/persistence` και `/http` του `@cqrs-ddd/core`, και
το `/package.json`. Ένα import μιας διαδρομής μέσα στο `dist` δεν επιλύεται πλέον· κάντε import το ίδιο όνομα
από το entry point.

```bash
pnpm add @nestjs-pipeline/core@^0.4.0
```
