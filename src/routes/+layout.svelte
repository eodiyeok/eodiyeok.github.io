<script lang="ts">
	import { base } from '$app/paths';
	import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';

	let { children } = $props();
</script>

<svelte:head>
	<meta name="theme-color" content="#101820" />
	<meta name="color-scheme" content="light" />
	<link rel="manifest" href={`${base}/manifest.webmanifest`} />
	<link rel="icon" type="image/png" sizes="192x192" href={`${base}/icons/icon-192.png`} />
	<link rel="apple-touch-icon" href={`${base}/icons/icon-192.png`} />
</svelte:head>

{@render children()}
