---
trigger: always_on
---

When styling, prefer using display: flex/grid and gap, versus relying on margin
or padding.

For example, when styling this:

```
<article id="example">
  <div></div>
  <div></div>
</article>
```

Prefer:

```
#example {
  display: flex;
  gap: 8px;
  padding: 8px;
}
```

To:

```
#example {
  display: block;
  padding: 8px;
  > div {
    margin-bottom: 8px;
    &:last-child {
      margin-bottom: 0;
    }
  }
}
```

The exception: when making lists of interactive/selectable items, you should not
substitute gap styling for padding, since that affects the sizing and thus click
targets/reactive styling of the elements when interacted with.
