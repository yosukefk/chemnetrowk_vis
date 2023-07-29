import pyomo.environ as pyo
import pandas as pd
import numpy as np
import json

def df_to_dict(df):
    return df.set_index(df.columns[:-1].tolist()).to_dict()[df.columns[-1]]
def df_to_list(df):
    #return df.iloc[:, 0].tolist()
    return df.set_index(df.columns.tolist()).index.tolist()

def chemnetwork_model(j, i, a, cost, demand, supply, product_group=None, product_group_i=None, product_group_demand=None):

    # the model
    m = pyo.ConcreteModel()

    # two main sets
    m.j = pyo.Set(doc='Process', initialize=j)
    m.i = pyo.Set(doc='Material', initialize=i)

    # production lavel (variable)
    m.x = pyo.Var(m.j, doc='Production level', within=pyo.NonNegativeReals)

    # the io matrix
    m.a = pyo.Param(m.i, m.j, doc='IO matrix', initialize=a, default=0)

    # process cost
    m.cost = pyo.Param(m.j, doc='Process cost', initialize=cost)

    # material supply/demand
    m.demand = pyo.Param(m.i, doc='Demand', initialize=demand, default=0)
    m.supply = pyo.Param(m.i, doc='Supply', initialize=supply, default=0)

    # product group for grouped demand
    m.pgrp = pyo.Set(doc='Product group', initialize=product_group)
    m.pgrp_i = pyo.Set(m.pgrp * m.i, doc='Product group member materials', initialize=product_group_i)
    m.pgrp_demand = pyo.Param(m.pgrp, doc='Product group demand', initialize=product_group_demand)

    # objectiove (sum of cost * x across j)
    m.cst_obj = pyo.Objective(expr=sum(m.cost[j] * m.x[j] for j in m.j), sense=pyo.minimize)

    # mass balance constraint
    def mb_rule(m, i):
        return sum(m.a[i,j] * m.x[j] for j in m.j) >= m.demand[i] - m.supply[i]

    m.mb_con = pyo.Constraint(m.i, rule=mb_rule)

    # product group demand constraint
    def pgrp_rule(m, pgrp):
        return sum(
                sum(m.a[i,j] * m.x[j] for j in m.j) 
                for i in m.i if (pgrp,i) in m.pgrp_i) >= m.pgrp_demand[pgrp]
    m.pgrp_con = pyo.Constraint(m.pgrp, rule=pgrp_rule)


    return m

# 1. read from excel file
inpfile = 'cthru_summer2022_v8.xlsm'

# process and material
j = pd.read_excel(inpfile, sheet_name='XtoG', usecols="A", names=['j']).dropna()
i = pd.read_excel(inpfile, sheet_name='XtoG', usecols="C", names=['i']).dropna()

# io matrix
a = pd.read_excel(inpfile, sheet_name='XtoG', usecols="E:G", names=['i','j', 'a']).dropna()

# cost
cost = pd.read_excel(inpfile, sheet_name='XtoG', usecols="I:J", names=['j', 'cost']).dropna()

# supply/demand
demand = pd.read_excel(inpfile, sheet_name='XtoG', usecols="L:M", names=['i', 'demand']).dropna()
supply = pd.read_excel(inpfile, sheet_name='XtoG', usecols="O:P", names=['i', 'supply']).dropna()
primary_raw = pd.read_excel(inpfile, sheet_name='XtoG', usecols="O").dropna()
unconstrained_raw = pd.read_excel(inpfile, sheet_name='XtoG', usecols="R", names=['i']).dropna()
utility = pd.read_excel(inpfile, sheet_name='XtoG', usecols="T", names=['i']).dropna()

# product group
pgrp = pd.read_excel(inpfile, sheet_name='XtoG', usecols="AL", names=['pgrp']).dropna()
pgrp_i = pd.read_excel(inpfile, sheet_name='XtoG', usecols="AI:AJ", names=['pgrp', 'i']).dropna()
pgrp_demand = pd.read_excel(inpfile, sheet_name='XtoG', usecols="AL:AM", names=['pgrp', 'demand']).dropna()


dropped_process = pd.read_excel(inpfile, sheet_name='XtoG', usecols="AO", names=['dropped_process']).dropna()

# 2. need to clean the data...


_demand = demand.loc[demand.demand > 0, :]
_demand = _demand.loc[_demand.i != 'VINYLCHLORIDE_ACETATECOPOLYMER', :]

_pgrp_i = pgrp_i.loc[pgrp_i.i != 'PBTPELLETS_IVGTR1DOT1_', :]


# 3. finalize model inputs
# 3.1 process, drop user specified processes
_j = j.loc[~ j.j.isin(dropped_process.dropped_process), :]
_j = _j.loc[~ _j.j.isin(['P227', 'P228', 'P229']), :]


# 3.2 supply
_supply = pd.concat([
    supply, 
        pd.DataFrame({'i' : unconstrained_raw.i, 'supply': np.inf}),
        pd.DataFrame({'i' : utility.i, 'supply': np.inf}),
        ]
        )

_cost = cost.loc[cost.j.isin(_j.j),:]
_cost.loc[_cost.j == 'P3001', 'cost'] = 999.
_cost.loc[_cost.j == 'P3002', 'cost'] = 999.
_a = a.loc[(a.i.isin(i.i) & a.j.isin(_j.j)), :]

#_demand['demand'] = _demand.demand * .1
#_demand['demand'] = 0.

# instantiate model
m = chemnetwork_model(
        j=df_to_list(_j), 
        i=df_to_list(i), 
        a=df_to_dict(_a), 
        cost=df_to_dict(_cost),
        supply=df_to_dict(_supply),
        demand=df_to_dict(_demand),
        product_group = df_to_list(pgrp),
        product_group_i = df_to_list(_pgrp_i), 
        product_group_demand = df_to_dict(pgrp_demand)
        )

solver = pyo.SolverFactory('cplex')
solver.options[ 'logfile'] = 'cplex_log.txt'  # Set the log file path

results = solver.solve(m)

# Print the results
print("Solver Status:", results.solver.status)
print("Termination Condition:", results.solver.termination_condition)

if results.solver.termination_condition == pyo.TerminationCondition.optimal:
    print("Optimal Solution Found")
    #for j in m.j:
    #    try:
    #        print(f"Optimal Value of x[{j}]:", pyo.value(m.x[j]))
    #    except ValueError as e:
    #        print(e)

else:
    print("Solver Failed to Find an Optimal Solution")

solution = {}


a  = {k:v for k,v in m.a.items() if v != 0}
df_a = pd.DataFrame.from_dict(a, orient='index', columns=['a'])
df_a.index = pd.MultiIndex.from_tuples(df_a.index, names=['material', 'process'])


x = {k:v.value for k,v in m.x.items()}
df_x = pd.DataFrame.from_dict(x, orient='index', columns=['x'])
df_x = df_x.loc[df_x.x != 0, :]
df_x.index.name = 'process'

df_ax = df_a.join(df_x)
df_ax = df_ax.loc[~df_ax.x.isnull(), :].reset_index().assign(
        net_prod = lambda df: df.a * df.x,
        gross_prod = lambda df: (df.a+df.a.abs()) * .5 * df.x,
        gross_cons = lambda df: (df.a-df.a.abs()) * .5 * df.x,
        )

df_throughput = df_ax.loc[:, ['material', 'process', 'net_prod']].rename(columns={'net_prod': 'throughput'})
df_net_prod = df_ax.loc[:, ['material', 'process', 'net_prod']].groupby('material')['net_prod'].sum().to_frame()
df_gross_prod = df_ax.loc[:, ['material', 'process', 'gross_prod']].groupby('material')['gross_prod'].sum().to_frame()
df_gross_cons = df_ax.loc[:, ['material', 'process', 'gross_cons']].groupby('material')['gross_cons'].sum().to_frame()

df_throughput = df_throughput.loc[df_throughput.throughput != 0, :].set_index(['material', 'process'])
df_net_prod = df_net_prod.loc[df_net_prod.net_prod != 0, :]
df_gross_prod = df_gross_prod.loc[df_gross_prod.gross_prod != 0, :]
df_gross_cons = df_gross_cons.loc[df_gross_cons.gross_cons != 0, :]

def df_to_dict_of_dict(df):
    # works only when two levels in multiindex, and one column for the table
    # table header will be dropped, scalar for dict value

    dct = {}
    for (l1, l2), val in df.to_dict(orient='index').items():
        dct.setdefault(l1, {})[l2] = next(iter(val.values()))
    return dct



solution['i'] = list(m.i)
solution['j'] = list(m.j)
solution['demand'] = {k:v for k,v in m.demand.items() if v != 0}
solution['supply'] = {k:v for k,v in m.supply.items() if v != 0}
solution['a'] =  df_to_dict_of_dict(df_a)
solution['x'] =  df_x.to_dict()['x']
solution['throughput'] = df_to_dict_of_dict(df_throughput) 
solution['net_prod'] = df_net_prod.to_dict()['net_prod']
solution['gross_prod'] = df_gross_prod.to_dict()['gross_prod']
solution['gross_cons'] = df_gross_cons.to_dict()['gross_cons']

with open('sln.json', 'w') as f:
    json.dump(solution, f, indent=2)
