// ============================================================
// Batch Runner — 统一批量执行器
// 为所有前端批量生成（镜头图/视频/配音/合成/角色图/场景图）提供：
//   1. 可配置并发（worker pool，避免无控制并发导致的状态竞态）
//   2. 批次级取消（AbortSignal）
//   3. 逐项失败收集（不再静默吞错，供 UI 展示与重试失败项）
// ============================================================

export interface BatchFailedItem<T> {
  item: T
  index: number
  error: string
}

export interface BatchRunnerResult<T> {
  succeeded: T[]
  failed: BatchFailedItem<T>[]
  /** 是否因取消而提前终止 */
  aborted: boolean
  /** 已完成数（成功 + 失败，不含取消后未调度项） */
  processed: number
}

export interface BatchRunnerOptions<T> {
  /** 并发数，默认 1（串行）；图片类建议 2-3，视频类保持 1 */
  concurrency?: number
  /** 批次级取消信号 */
  signal?: AbortSignal
  /** 每完成一项（无论成败）后的回调，用于进度展示 */
  onItemDone?: (result: BatchRunnerResult<T>['succeeded'], failed: BatchFailedItem<T>[], processed: number, total: number) => void
}

/**
 * 以受控并发执行一批任务。
 *
 * - 任一任务抛错不会中断整批：错误被收集到 failed，其余任务继续
 * - signal 被 abort 后不再调度新任务；进行中的任务自行响应信号提前结束
 * - task 内部应自行捕获取消并尽快返回/抛出
 */
export async function runBatch<T>(
  items: T[],
  task: (item: T, index: number) => Promise<void>,
  options: BatchRunnerOptions<T> = {}
): Promise<BatchRunnerResult<T>> {
  const { concurrency = 1, signal, onItemDone } = options

  const result: BatchRunnerResult<T> = {
    succeeded: [],
    failed: [],
    aborted: false,
    processed: 0,
  }

  let nextIndex = 0

  const isAborted = () => signal?.aborted ?? false

  const runOne = async (): Promise<void> => {
    while (true) {
      if (isAborted()) {
        result.aborted = true
        return
      }
      const index = nextIndex++
      if (index >= items.length) return

      const item = items[index]
      try {
        await task(item, index)
        result.succeeded.push(item)
      } catch (err) {
        if (isAborted()) {
          // 取消导致的失败不计入失败清单
          result.aborted = true
          return
        }
        result.failed.push({
          item,
          index,
          error: err instanceof Error ? err.message : String(err),
        })
      }
      result.processed++
      onItemDone?.(result.succeeded, result.failed, result.processed, items.length)
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  const workers: Promise<void>[] = []
  for (let w = 0; w < workerCount; w++) {
    workers.push(runOne(w))
  }
  await Promise.all(workers)

  return result
}
