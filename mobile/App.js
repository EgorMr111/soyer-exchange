import 'react-native-url-polyfill/auto';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://soyer-exchange-api.onrender.com';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        storage: {
          getItem: (key) => SecureStore.getItemAsync(key),
          setItem: (key, value) => SecureStore.setItemAsync(key, value),
          removeItem: (key) => SecureStore.deleteItemAsync(key)
        },
        autoRefreshToken: true, persistSession: true, detectSessionInUrl: false
      }
    }) : null;

const money = (n) => Number(n || 0).toLocaleString('uk-UA', { maximumFractionDigits: 2 });
const initialSettings = { rateUsdtToUah: 46.6, rateUahToUsdt: 47.7, minimumUsdt: 10, managerUrl: 'https://t.me/soyermanager' };

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [settings, setSettings] = useState(initialSettings);
  const [direction, setDirection] = useState('USDT_UAH');
  const [give, setGive] = useState('100');
  const [receive, setReceive] = useState(String(100 * initialSettings.rateUsdtToUah));
  const [screen, setScreen] = useState('home');
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetch(API_URL + '/api/settings').then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSettings(s => ({ ...s, ...data })); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const rate = direction === 'USDT_UAH' ? Number(settings.rateUsdtToUah) : 1 / Number(settings.rateUahToUsdt);
    const amount = Number(give.replace(',', '.'));
    if (Number.isFinite(amount) && amount >= 0 && Number.isFinite(rate)) setReceive((amount * rate).toFixed(2));
  }, [direction, settings, give]);

  const rate = direction === 'USDT_UAH' ? Number(settings.rateUsdtToUah) : 1 / Number(settings.rateUahToUsdt);
  const inverseRate = direction === 'USDT_UAH' ? 1 / rate : 1 / rate;
  const fromCurrency = direction === 'USDT_UAH' ? 'USDT' : 'UAH';
  const toCurrency = direction === 'USDT_UAH' ? 'UAH' : 'USDT';

  const loadOrders = async () => {
    if (!supabase || !session?.user) return;
    const { data, error } = await supabase.from('exchange_requests').select('*').order('created_at', { ascending: false });
    if (error) Alert.alert('Помилка', error.message);
    else setOrders(data || []);
  };
  useEffect(() => { if (session) loadOrders(); }, [session]);

  const submitAuth = async () => {
    if (!supabase) return Alert.alert('Потрібне налаштування', 'Додайте Supabase URL та anon key у mobile/.env');
    if (!email.trim() || password.length < 8) return Alert.alert('Перевірте дані', 'Вкажіть email і пароль щонайменше з 8 символів.');
    setBusy(true);
    try {
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === 'register' && !result.data.session) Alert.alert('Перевірте пошту', 'Ми надіслали лист для підтвердження email. Після підтвердження увійдіть у застосунок.');
      else setScreen('home');
    } catch (e) { Alert.alert('Не вдалося виконати запит', e.message || 'Спробуйте ще раз.'); }
    finally { setBusy(false); }
  };

  const createOrder = async () => {
    if (!supabase || !session) return;
    const amount = Number(give.replace(',', '.'));
    const result = Number(receive.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(result) || result <= 0)
      return Alert.alert('Перевірте суму', 'Введіть коректну суму для обміну.');
    if (direction === 'USDT_UAH' && amount < Number(settings.minimumUsdt || 10))
      return Alert.alert('Мінімальна сума', 'Мінімум для цього напрямку: ' + settings.minimumUsdt + ' USDT.');
    setBusy(true);
    const { error } = await supabase.from('exchange_requests').insert({
      user_id: session.user.id, email: session.user.email,
      direction, give_amount: amount, give_currency: fromCurrency,
      receive_amount: result, receive_currency: toCurrency,
      rate: rate, status: 'new'
    });
    setBusy(false);
    if (error) Alert.alert('Не вдалося створити заявку', error.message);
    else { Alert.alert('Заявку створено', 'Вона з’явиться в історії. Менеджер уточнить деталі.'); setScreen('history'); loadOrders(); }
  };

  const updateGive = (value) => {
    setGive(value);
    const amount = Number(value.replace(',', '.'));
    if (Number.isFinite(amount)) setReceive((amount * rate).toFixed(2));
  };
  const updateReceive = (value) => {
    setReceive(value);
    const amount = Number(value.replace(',', '.'));
    if (Number.isFinite(amount) && rate > 0) setGive((amount / rate).toFixed(2));
  };

  if (!authReady) return <Splash />;
  if (!session) return <AuthScreen mode={mode} setMode={setMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} submit={submitAuth} busy={busy} configured={!!supabase} />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#07110D" />
      <View style={styles.header}>
        <View><Text style={styles.brand}>SOYER <Text style={styles.brandAccent}>EXCHANGE</Text></Text><Text style={styles.muted}>Особистий кабінет</Text></View>
        <TouchableOpacity onPress={() => supabase.auth.signOut()}><Text style={styles.logout}>Вийти</Text></TouchableOpacity>
      </View>
      <View style={styles.tabs}>
        <Tab title="Обмін" active={screen === 'home'} onPress={() => setScreen('home')} />
        <Tab title="Історія" active={screen === 'history'} onPress={() => setScreen('history')} />
        <Tab title="Профіль" active={screen === 'profile'} onPress={() => setScreen('profile')} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {screen === 'home' && <>
          <Text style={styles.heading}>Обмін валют</Text>
          <Text style={styles.muted}>Оберіть напрямок та вкажіть суму</Text>
          <View style={styles.switchRow}>
            <Tab title="USDT → UAH" active={direction === 'USDT_UAH'} onPress={() => { setDirection('USDT_UAH'); setGive('100'); }} />
            <Tab title="UAH → USDT" active={direction === 'UAH_USDT'} onPress={() => { setDirection('UAH_USDT'); setGive('5000'); }} />
          </View>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>ВІДДАЮ · {fromCurrency}</Text>
            <TextInput style={styles.amount} keyboardType="decimal-pad" value={give} onChangeText={updateGive} placeholder="0.00" placeholderTextColor="#60736A" />
            <View style={styles.line} />
            <Text style={styles.fieldLabel}>ОТРИМУЮ · {toCurrency}</Text>
            <TextInput style={styles.amount} keyboardType="decimal-pad" value={receive} onChangeText={updateReceive} placeholder="0.00" placeholderTextColor="#60736A" />
            <View style={styles.rateBox}><Text style={styles.muted}>Попередній курс</Text><Text style={styles.rateText}>1 USDT = {money(settings.rateUsdtToUah)} UAH</Text></View>
            <Text style={styles.small}>Розрахунок попередній. Остаточні умови підтверджує менеджер.</Text>
            <TouchableOpacity style={styles.primary} onPress={createOrder} disabled={busy}>
              {busy ? <ActivityIndicator color="#07110D" /> : <Text style={styles.primaryText}>Створити заявку</Text>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.support} onPress={() => Linking.openURL(settings.managerUrl || 'https://t.me/soyermanager')}>
            <Text style={styles.supportTitle}>Потрібна допомога?</Text><Text style={styles.muted}>Зв’язатися з менеджером →</Text>
          </TouchableOpacity>
        </>}
        {screen === 'history' && <>
          <Text style={styles.heading}>Мої заявки</Text>
          <TouchableOpacity onPress={loadOrders} style={styles.refresh}><Text style={styles.green}>Оновити список ↻</Text></TouchableOpacity>
          {orders.length === 0 ? <Text style={styles.empty}>Поки що заявок немає.</Text> : orders.map(order => <View key={order.id} style={styles.order}>
            <View style={styles.orderTop}><Text style={styles.orderId}>Заявка #{String(order.id).slice(0,8)}</Text><Text style={styles.status}>{statusLabel(order.status)}</Text></View>
            <Text style={styles.orderAmount}>{money(order.give_amount)} {order.give_currency} → {money(order.receive_amount)} {order.receive_currency}</Text>
            <Text style={styles.muted}>{new Date(order.created_at).toLocaleString('uk-UA')}</Text>
          </View>)}
        </>}
        {screen === 'profile' && <>
          <Text style={styles.heading}>Профіль</Text>
          <View style={styles.card}><Text style={styles.fieldLabel}>EMAIL</Text><Text style={styles.profileEmail}>{session.user.email}</Text><Text style={styles.muted}>Ваш обліковий запис SOYER EXCHANGE</Text></View>
          <TouchableOpacity style={styles.support} onPress={() => Linking.openURL(settings.managerUrl || 'https://t.me/soyermanager')}><Text style={styles.supportTitle}>Служба підтримки</Text><Text style={styles.muted}>Написати менеджеру →</Text></TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={() => supabase.auth.signOut()}><Text style={styles.logout}>Вийти з акаунта</Text></TouchableOpacity>
        </>}
        <Text style={styles.footer}>SOYER EXCHANGE · Інформаційний сервіс</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function AuthScreen({ mode, setMode, email, setEmail, password, setPassword, submit, busy, configured }) {
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="light-content" backgroundColor="#07110D" />
    <KeyboardAvoidingView style={styles.authWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.logoMark}><Text style={styles.logoLetter}>S</Text></View>
      <Text style={styles.brand}>SOYER <Text style={styles.brandAccent}>EXCHANGE</Text></Text>
      <Text style={styles.authTitle}>{mode === 'login' ? 'З поверненням' : 'Створити акаунт'}</Text>
      <Text style={styles.muted}>Увійдіть, щоб керувати заявками на обмін</Text>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>EMAIL</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@example.com" placeholderTextColor="#60736A" />
        <Text style={styles.fieldLabel}>ПАРОЛЬ</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Щонайменше 8 символів" placeholderTextColor="#60736A" />
        <TouchableOpacity style={styles.primary} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#07110D" /> : <Text style={styles.primaryText}>{mode === 'login' ? 'Увійти' : 'Зареєструватися'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'register' : 'login')}><Text style={styles.authSwitch}>{mode === 'login' ? 'Ще не маєте акаунта? Зареєструватися' : 'Вже маєте акаунт? Увійти'}</Text></TouchableOpacity>
      </View>
      {!configured && <Text style={styles.warning}>Налаштуйте Supabase у файлі mobile/.env перед запуском.</Text>}
      <Text style={styles.footer}>Захищений вхід · SOYER EXCHANGE</Text>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
function Splash() { return <View style={[styles.safe, styles.center]}><ActivityIndicator color="#35D07F" size="large" /></View>; }
function Tab({ title, active, onPress }) { return <TouchableOpacity onPress={onPress} style={[styles.tab, active && styles.tabActive]}><Text style={[styles.tabText, active && styles.tabTextActive]}>{title}</Text></TouchableOpacity>; }
function statusLabel(s) { return ({new:'Нова',processing:'В обробці',completed:'Завершена',cancelled:'Скасована'})[s] || s || 'Нова'; }

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#07110D'}, center:{justifyContent:'center',alignItems:'center'},
  header:{paddingHorizontal:22,paddingTop:16,paddingBottom:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  brand:{color:'#F2FFF7',fontSize:18,fontWeight:'900',letterSpacing:1.2}, brandAccent:{color:'#35D07F'},
  muted:{color:'#8DA397',fontSize:13,marginTop:5}, logout:{color:'#F28B83',fontWeight:'700'},
  tabs:{flexDirection:'row',marginHorizontal:18,padding:4,borderRadius:14,backgroundColor:'#101E17'},
  tab:{flex:1,paddingVertical:11,alignItems:'center',borderRadius:11}, tabActive:{backgroundColor:'#1B3929'},
  tabText:{color:'#91A69A',fontSize:12,fontWeight:'700'},tabTextActive:{color:'#55E394'},
  content:{padding:20,paddingBottom:42},heading:{fontSize:27,fontWeight:'900',color:'#F2FFF7'},switchRow:{flexDirection:'row',marginTop:22,marginBottom:14,gap:8},
  card:{backgroundColor:'#102018',borderColor:'#203D2D',borderWidth:1,borderRadius:22,padding:20,marginTop:20},
  fieldLabel:{color:'#8EA99A',fontSize:10,fontWeight:'800',letterSpacing:1.4,marginTop:8},
  amount:{fontSize:28,color:'#F2FFF7',fontWeight:'800',paddingVertical:12},line:{height:1,backgroundColor:'#284334',marginVertical:10},
  rateBox:{backgroundColor:'#0A1710',borderRadius:13,padding:13,marginTop:18},rateText:{color:'#55E394',fontWeight:'800',fontSize:15,marginTop:4},
  small:{color:'#81968A',fontSize:11,lineHeight:17,marginTop:12},primary:{backgroundColor:'#35D07F',borderRadius:13,padding:16,alignItems:'center',marginTop:20},
  primaryText:{color:'#06110B',fontWeight:'900',fontSize:15},support:{backgroundColor:'#102018',borderRadius:17,padding:18,marginTop:16,borderWidth:1,borderColor:'#203D2D'},
  supportTitle:{color:'#F2FFF7',fontWeight:'800',fontSize:15},footer:{color:'#52685B',fontSize:10,textAlign:'center',marginTop:30},
  authWrap:{flex:1,justifyContent:'center',padding:24},logoMark:{width:58,height:58,borderRadius:18,backgroundColor:'#153A27',alignItems:'center',justifyContent:'center',marginBottom:20},
  logoLetter:{fontSize:30,color:'#55E394',fontWeight:'900'},authTitle:{fontSize:28,fontWeight:'900',color:'#F2FFF7',marginTop:38},
  input:{backgroundColor:'#0A1710',borderColor:'#294535',borderWidth:1,borderRadius:12,padding:15,color:'#F2FFF7',fontSize:15,marginTop:8,marginBottom:14},
  authSwitch:{color:'#55E394',textAlign:'center',fontSize:12,fontWeight:'700',marginTop:18},warning:{color:'#F4C66A',textAlign:'center',marginTop:16,fontSize:12},
  profileEmail:{fontSize:17,color:'#F2FFF7',fontWeight:'700',marginVertical:12},logoutButton:{padding:18,alignItems:'center',marginTop:12},
  empty:{color:'#91A69A',textAlign:'center',marginTop:40},refresh:{alignSelf:'flex-end',padding:12},green:{color:'#55E394',fontWeight:'700'},
  order:{backgroundColor:'#102018',borderColor:'#203D2D',borderWidth:1,borderRadius:16,padding:16,marginTop:12},
  orderTop:{flexDirection:'row',justifyContent:'space-between'},orderId:{color:'#D9E8DF',fontWeight:'800'},status:{color:'#55E394',fontWeight:'700'},
  orderAmount:{color:'#F2FFF7',fontWeight:'800',fontSize:17,marginTop:14,marginBottom:4}
});