<script lang="ts">
  let count = $state(0)
</script>

<div>
  <button onclick={() => (count += 1)}>Increment</button>
  <p>Count is {count}</p>
</div>
