<template>
  <q-page class="page-users flex flex-center">
    <div class="users-wrapper">
      <div class="logo">
        <img src="src/assets/logo.png" alt="Restaurant logo" />
      </div>

      <div class="title">Foydalanuvchini tanlang</div>

      <!-- Loading -->
      <div v-if="isLoading" class="loading">
        Yuklanmoqda…
      </div>

      <!-- Users -->
      <div v-else class="users-grid">
        <button
          v-for="user in users"
          :key="user.id"
          type="button"
          class="user-card"
          @click="goToPin(user)"
        >
          <div class="avatar">
            <q-icon name="person" size="28px" />
          </div>

          <div class="name">
            {{ user.firstName }} {{ user.lastName }}
          </div>

          <div class="role">
            {{ user.role }}
          </div>
        </button>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from 'boot/axios'

/* ============
 * Types
 * ============ */

type UserRole = 'ADMIN' | 'CASHIER' | 'MANAGER'
type UserStatus = 'ACTIVE' | 'INACTIVE'

interface ApiUser {
  id: number
  first_name: string
  last_name: string
  email: string
  role: UserRole
  status: UserStatus
}

interface UsersApiResponse {
  success: boolean
  message: string
  data: {
    success: boolean
    users: ApiUser[]
  }
}

/* ============
 * Local model (UI-friendly)
 * ============ */

interface User {
  id: number
  firstName: string
  lastName: string
  role: UserRole
  email:string
}

/* ============
 * State
 * ============ */

const router = useRouter()

const users = ref<User[]>([])
const isLoading = ref<boolean>(true)

/* ============
 * Methods
 * ============ */

async function fetchUsers(): Promise<void> {
  try {
    const response = await api.get<UsersApiResponse>('/users')

    const apiUsers = response.data.data.users

    users.value = apiUsers
      .filter((user) => user.status === 'ACTIVE')
      .map((user) => ({
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        email: user.email
      }))
  } catch (error) {
    // позже можно добавить toast / dialog
    console.error(error)
    users.value = []
  } finally {
    isLoading.value = false
  }
}

function goToPin(user: User): void {
  void router.push({
    name: 'pin',
    query: {
      email: user.email,
      name: `${user.firstName} ${user.lastName}`
    }
  })
}

/* ============
 * Lifecycle
 * ============ */

onMounted(() => {
  void fetchUsers()
})
</script>

<style lang="scss">
.page-users {
  background: #0f1115;
}

.users-wrapper {
  width: 100%;
  max-width: 720px;
  padding: 32px 24px;
  text-align: center;
}

.logo {
  margin-bottom: 24px;

  img {
    height: 164px;
  }
}

.title {
  margin-bottom: 24px;
  font-size: 20px;
  font-weight: 600;
  color: #ffffff;
}

.loading {
  color: #b0b0b0;
  font-size: 14px;
}

.users-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.user-card {
  appearance: none;
  background: #1a1d23;
  border: none;
  border-radius: 16px;
  padding: 20px;
  color: #ffffff;
  cursor: pointer;
  text-align: center;

  &:active {
    transform: scale(0.97);
  }
}

.avatar {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: rgba(255, 122, 0, 0.15);
  color: #ff7a00;
  display: flex;
  align-items: center;
  justify-content: center;
}

.name {
  font-size: 16px;
  font-weight: 500;
}

.role {
  font-size: 12px;
  color: #b0b0b0;
}
</style>
