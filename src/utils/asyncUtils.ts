export async function withTimeout<T>(task: () => Thenable<T> | Promise<T>, timeoutMs: number, label: string): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			task(),
			new Promise<T>((_, reject) => {
				timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label} (${timeoutMs}ms)`)), timeoutMs);
			})
		]);
	} finally {
		if (timer) {
			clearTimeout(timer);
		}
	}
}
